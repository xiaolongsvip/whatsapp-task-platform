package com.wtp.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.File
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.concurrent.TimeUnit

/**
 * Shares the server-issued HttpOnly session cookie with the web API.
 * Persisted cookie data is encrypted with an Android Keystore AES-GCM key.
 */
object AuthRepository {
    private const val PREFS = "wtp_secure_session"
    private const val COOKIE_BLOB = "cookie_blob"
    private const val KEY_ALIAS = "wtp_session_aes_key"
    private const val HOST = "10.0.2.2"
    private val mediaType = "application/json; charset=utf-8".toMediaType()
    @Volatile private var appContext: Context? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
        restoreCookies()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun encryptedPreferences() = requireNotNull(appContext) {
        "AuthRepository.initialize(context) must be called first"
    }.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    private fun persistCookies(cookies: List<Cookie>) {
        val context = appContext ?: return
        if (cookies.isEmpty()) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(COOKIE_BLOB).apply()
            return
        }
        val plain = JSONArray().apply { cookies.forEach { put(it.toString()) } }.toString().toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(plain)
        val packed = JSONArray().put(Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put(Base64.encodeToString(encrypted, Base64.NO_WRAP)).toString()
        encryptedPreferences().edit().putString(COOKIE_BLOB, packed).apply()
    }

    @Synchronized
    private fun restoreCookies() {
        val context = appContext ?: return
        val packed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(COOKIE_BLOB, null) ?: return
        try {
            val values = JSONArray(packed)
            val iv = Base64.decode(values.getString(0), Base64.NO_WRAP)
            val encrypted = Base64.decode(values.getString(1), Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            val json = JSONArray(cipher.doFinal(encrypted).toString(Charsets.UTF_8))
            val url = com.wtp.app.BuildConfig.API_BASE_URL.toHttpUrl()
            val restored = mutableListOf<Cookie>()
            for (index in 0 until json.length()) {
                Cookie.parse(url, json.getString(index))?.let { cookie ->
                    if (cookie.expiresAt > System.currentTimeMillis()) restored.add(cookie)
                }
            }
            cookieJar.replace(url.host, restored)
            if (restored.isEmpty()) clearPersistedCookies()
        } catch (_: Exception) {
            clearPersistedCookies()
            cookieJar.replace(HOST, emptyList())
        }
    }

    @Synchronized
    private fun clearPersistedCookies() {
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.remove(COOKIE_BLOB)?.apply()
    }

    private val cookieJar = object : CookieJar {
        private val cookies = mutableMapOf<String, List<Cookie>>()

        @Synchronized
        override fun saveFromResponse(url: HttpUrl, newCookies: List<Cookie>) {
            val current = cookies[url.host].orEmpty().filterNot { old ->
                newCookies.any { it.name == old.name && it.domain == old.domain && it.path == old.path }
            }
            val updated = (current + newCookies).filter { it.expiresAt > System.currentTimeMillis() }
            cookies[url.host] = updated
            persistCookies(updated)
        }

        @Synchronized
        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val valid = cookies[url.host].orEmpty().filter { it.expiresAt > System.currentTimeMillis() }
            cookies[url.host] = valid
            return valid
        }

        @Synchronized
        fun replace(host: String, values: List<Cookie>) { cookies[host] = values }
    }

    private val client = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .build()

    private fun endpoint(path: String) =
        (com.wtp.app.BuildConfig.API_BASE_URL.trimEnd('/') + "/" + path.trimStart('/'))

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        val builder = Request.Builder().url(endpoint(path))
        when (method) {
            "POST" -> builder.post((body ?: JSONObject()).toString().toRequestBody(mediaType))
            "PATCH" -> builder.patch((body ?: JSONObject()).toString().toRequestBody(mediaType))
            "GET" -> builder.get()
            else -> throw IllegalArgumentException("Unsupported method")
        }
        client.newCall(builder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = if (raw.isBlank()) JSONObject() else runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (!response.isSuccessful) {
                val message = when (val value = json.opt("message")) {
                    is String -> value
                    is JSONArray -> (0 until value.length()).joinToString("；") { value.optString(it) }
                    else -> "请求失败（HTTP ${response.code}），请稍后重试。"
                }
                throw IOException(message)
            }
            return json
        }
    }

    fun login(phone: String, password: String): JSONObject =
        request("POST", "auth/login", JSONObject().put("phone", phone).put("password", password))

    fun register(phone: String, password: String, inviteCode: String?): JSONObject {
        val body = JSONObject().put("phone", phone).put("password", password)
        if (!inviteCode.isNullOrBlank()) body.put("inviteCode", inviteCode.trim())
        return request("POST", "auth/register", body)
    }

    fun currentUser(): JSONObject = request("GET", "auth/me")

    fun dashboard(): JSONObject = request("GET", "users/dashboard")

    fun publishedTasks(): JSONObject = request("GET", "tasks")

    fun myTaskClaims(): JSONObject = request("GET", "tasks/my/claims")

    fun claimTask(taskId: String, idempotencyKey: String): JSONObject =
        request("POST", "tasks/$taskId/claims", JSONObject().put("idempotencyKey", idempotencyKey))

    fun submitTaskEvidence(
        claimId: String,
        filePath: String,
        note: String,
        idempotencyKey: String,
    ): JSONObject {
        val file = File(filePath)
        if (!file.isFile || !file.canRead()) throw IOException("找不到待上传截图，请重新截图。")
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", file.name, file.asRequestBody("image/jpeg".toMediaType()))
            .addFormDataPart("note", note)
            .build()
        val httpRequest = Request.Builder()
            .url(endpoint("tasks/claims/$claimId/submissions"))
            .header("Idempotency-Key", idempotencyKey)
            .post(body)
            .build()
        client.newCall(httpRequest).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = if (raw.isBlank()) JSONObject() else runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (!response.isSuccessful) {
                val message = when (val value = json.opt("message")) {
                    is String -> value
                    is JSONArray -> (0 until value.length()).joinToString("；") { value.optString(it) }
                    else -> "证据上传失败（HTTP " + response.code + "），请稍后重试。"
                }
                throw IOException(message)
            }
            return json
        }
    }

    fun updateLocale(locale: String): JSONObject =
        request("PATCH", "users/me", JSONObject().put("locale", locale))

    fun logout() {
        try { request("POST", "auth/logout") } finally {
            cookieJar.replace(endpoint("").toHttpUrl().host, emptyList())
            clearPersistedCookies()
        }
    }
}
