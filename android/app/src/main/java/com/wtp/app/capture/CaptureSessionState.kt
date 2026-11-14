package com.wtp.app.capture

import android.content.Context
import android.content.SharedPreferences
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-process state for the user-authorized capture session and the task
 * explicitly selected for evidence submission. Pending evidence metadata is
 * persisted so a failed upload can be retried after Android recreates the app.
 * The MediaProjection consent token is never persisted.
 */
object CaptureSessionState {
    private const val PREFS_NAME = "wtp_pending_evidence"
    private const val KEY_NAME = "name"
    private const val KEY_PATH = "path"
    private const val KEY_CLAIM_ID = "claim_id"
    private const val KEY_IDEMPOTENCY = "idempotency_key"

    @Volatile
    private var preferences: SharedPreferences? = null

    private val persistenceLock = Any()

    private val _active = MutableStateFlow(false)
    val active = _active.asStateFlow()

    private val _lastCaptureName = MutableStateFlow<String?>(null)
    val lastCaptureName = _lastCaptureName.asStateFlow()

    private val _lastCaptureClaimId = MutableStateFlow<String?>(null)
    val lastCaptureClaimId = _lastCaptureClaimId.asStateFlow()

    private val _lastCapturePath = MutableStateFlow<String?>(null)
    val lastCapturePath = _lastCapturePath.asStateFlow()

    private val _pendingIdempotencyKey = MutableStateFlow<String?>(null)
    val pendingIdempotencyKey = _pendingIdempotencyKey.asStateFlow()

    private val _activeClaimId = MutableStateFlow<String?>(null)
    val activeClaimId = _activeClaimId.asStateFlow()

    private val _uploadMessage = MutableStateFlow<String?>(null)
    val uploadMessage = _uploadMessage.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    /** Must be called from Application context before the capture service is used. */
    fun initialize(context: Context) {
        synchronized(persistenceLock) {
            val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            preferences = prefs

            val path = prefs.getString(KEY_PATH, null)
            val claimId = prefs.getString(KEY_CLAIM_ID, null)
            val idempotencyKey = prefs.getString(KEY_IDEMPOTENCY, null)
            val name = prefs.getString(KEY_NAME, null)

            if (!path.isNullOrBlank() &&
                !claimId.isNullOrBlank() &&
                !idempotencyKey.isNullOrBlank() &&
                File(path).isFile
            ) {
                _lastCaptureName.value = name ?: File(path).name
                _lastCapturePath.value = path
                _lastCaptureClaimId.value = claimId
                _pendingIdempotencyKey.value = idempotencyKey
            } else {
                clearPersistedEvidence(prefs)
                clearInMemoryEvidence()
            }
        }
    }

    internal fun setActive(value: Boolean) {
        _active.value = value
    }

    internal fun setLastCapture(name: String, path: String, idempotencyKey: String, claimId: String? = null) {
        synchronized(persistenceLock) {
            val prefs = preferences
            if (!claimId.isNullOrBlank() && idempotencyKey.isNotBlank() && path.isNotBlank() && prefs != null) {
                val saved = prefs.edit()
                    .putString(KEY_NAME, name)
                    .putString(KEY_PATH, path)
                    .putString(KEY_CLAIM_ID, claimId)
                    .putString(KEY_IDEMPOTENCY, idempotencyKey)
                    .commit()
                if (!saved) {
                    _error.value = "无法保存截图重试信息，请保持 APP 运行并检查设备存储空间。"
                }
            } else if (claimId.isNullOrBlank()) {
                clearPersistedEvidence(prefs)
            }

            _lastCaptureName.value = name
            _lastCapturePath.value = path
            _lastCaptureClaimId.value = claimId
            _pendingIdempotencyKey.value = idempotencyKey
            _uploadMessage.value = null
            if (_error.value == null) _error.value = null
        }
    }

    fun setActiveClaim(claimId: String) {
        _activeClaimId.value = claimId
        _uploadMessage.value = null
        _error.value = null
    }

    fun clearActiveClaim() {
        _activeClaimId.value = null
    }

    fun markLastCaptureUploaded(message: String) {
        synchronized(persistenceLock) {
            clearPersistedEvidence(preferences)
            _lastCapturePath.value = null
            _pendingIdempotencyKey.value = null
            _lastCaptureClaimId.value = null
            _uploadMessage.value = message
            _error.value = null
            _activeClaimId.value = null
        }
    }

    fun clearLastCapture() {
        synchronized(persistenceLock) {
            clearPersistedEvidence(preferences)
            clearInMemoryEvidence()
        }
    }

    private fun clearPersistedEvidence(prefs: SharedPreferences?) {
        prefs?.edit()
            ?.remove(KEY_NAME)
            ?.remove(KEY_PATH)
            ?.remove(KEY_CLAIM_ID)
            ?.remove(KEY_IDEMPOTENCY)
            ?.commit()
    }

    private fun clearInMemoryEvidence() {
        _lastCaptureName.value = null
        _lastCapturePath.value = null
        _lastCaptureClaimId.value = null
        _pendingIdempotencyKey.value = null
        _uploadMessage.value = null
    }

    internal fun setError(message: String?) {
        _error.value = message
    }
}
