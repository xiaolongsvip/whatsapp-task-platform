package com.wtp.app.data

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Uses the same HttpOnly wtp_session cookie as the web application.
 * Cookies are held in memory for this app process; they are never exposed to UI code.
 */
object AuthRepository {
    private val mediaType = "application/json; charset=utf-8".toMediaType()
    private val cookieJar = object : CookieJar {
        private val cookies = mutableMapOf<String, List<Cookie>>()

        @Synchronized
        override fun saveFromResponse(url: HttpUrl, newCookies: List<Cookie>) {
            val current = cookies[url.host].orEmpty().filterNot { old ->
                newCookies.any { it.name == old.name && it.domain == old.domain && it.path == old.path }
            }
            cookies[url.host] = current + newCookies.filterNot { it.expiresAt < System.currentTimeMillis() }
        }

        @Synchronized
        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val valid = cookies[url.host].orEmpty().filter { it.expiresAt >= System.currentTimeMillis() }
            cookies[url.host] = valid
            return valid
        }
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
            "GET" -> builder.get()
            else -> throw IllegalArgumentException("Unsupported method")
        }

        client.newCall(builder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = if (raw.isBlank()) JSONObject() else runCatching { JSONObject(raw) }.getOrElse { JSONObject() }
            if (!response.isSuccessful) {
                val message = when (val value = json.opt("message")) {
                    is String -> value
                    is org.json.JSONArray -> (0 until value.length()).joinToString("；") { value.optString(it) }
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

    fun logout() {
        request("POST", "auth/logout")
    }
}
