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
    private const val KEY_OWNER_USER_ID = "owner_user_id"

    @Volatile
    private var preferences: SharedPreferences? = null
    @Volatile
    private var appFilesDir: File? = null
    private var authenticatedUserId: String? = null

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
            if (preferences != null) return
            val appContext = context.applicationContext
            val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            preferences = prefs
            appFilesDir = appContext.filesDir
            authenticatedUserId = null
            _activeClaimId.value = null

            val path = prefs.getString(KEY_PATH, null)
            val claimId = prefs.getString(KEY_CLAIM_ID, null)
            val idempotencyKey = prefs.getString(KEY_IDEMPOTENCY, null)
            val name = prefs.getString(KEY_NAME, null)
            val metadata = PendingEvidenceMetadata(
                ownerUserId = prefs.getString(KEY_OWNER_USER_ID, null),
                path = path,
                claimId = claimId,
                idempotencyKey = idempotencyKey,
            )

            val validPath = path?.takeIf { candidate ->
                candidate.isNotBlank() && isManagedEvidenceFile(candidate) && File(candidate).isFile
            }
            if (validPath != null &&
                metadata.claimId?.isNotBlank() == true &&
                metadata.idempotencyKey?.isNotBlank() == true
            ) {
                _lastCaptureName.value = name ?: File(validPath).name
                _lastCapturePath.value = validPath
                _lastCaptureClaimId.value = claimId
                _pendingIdempotencyKey.value = idempotencyKey
            } else {
                deleteManagedEvidenceFile(path)
                clearPersistedEvidence(prefs)
                clearInMemoryEvidence()
            }
        }
    }

    /**
     * Restores a pending retry only after the server has identified the
     * authenticated member. A different account can never inherit another
     * member's screenshot, claim ID, or idempotency key.
     */
    fun setAuthenticatedUser(userId: String): Boolean {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return false

        synchronized(persistenceLock) {
            val prefs = preferences ?: return false
            val path = _lastCapturePath.value
            if (!path.isNullOrBlank()) {
                val metadata = PendingEvidenceMetadata(
                    ownerUserId = prefs.getString(KEY_OWNER_USER_ID, null),
                    path = path,
                    claimId = _lastCaptureClaimId.value,
                    idempotencyKey = _pendingIdempotencyKey.value,
                )
                if (metadata.canRestoreFor(normalizedUserId, isManagedEvidenceFile(path) && File(path).isFile)) {
                    _activeClaimId.value = metadata.claimId
                } else {
                    deleteManagedEvidenceFile(path)
                    clearPersistedEvidence(prefs)
                    clearInMemoryEvidence()
                    _activeClaimId.value = null
                }
            } else {
                val storedOwner = prefs.getString(KEY_OWNER_USER_ID, null)
                if (!storedOwner.isNullOrBlank() && storedOwner != normalizedUserId) {
                    clearPersistedEvidence(prefs)
                }
                _activeClaimId.value = null
            }

            authenticatedUserId = normalizedUserId
            return true
        }
    }

    internal fun setActive(value: Boolean) {
        _active.value = value
    }

    internal fun setLastCapture(name: String, path: String, idempotencyKey: String, claimId: String? = null): Boolean {
        synchronized(persistenceLock) {
            val prefs = preferences
            val ownerId = authenticatedUserId
            val shouldPersist = !claimId.isNullOrBlank() &&
                idempotencyKey.isNotBlank() &&
                path.isNotBlank() &&
                !ownerId.isNullOrBlank()
            val persisted = shouldPersist && prefs != null && prefs.edit()
                .putString(KEY_NAME, name)
                .putString(KEY_PATH, path)
                .putString(KEY_CLAIM_ID, claimId)
                .putString(KEY_IDEMPOTENCY, idempotencyKey)
                .putString(KEY_OWNER_USER_ID, ownerId)
                .commit()

            _lastCaptureName.value = name
            _lastCapturePath.value = path
            _lastCaptureClaimId.value = claimId
            _pendingIdempotencyKey.value = idempotencyKey
            _uploadMessage.value = null
            _error.value = if (persisted) null else
                "无法安全保存截图重试信息，请确认已登录并检查设备存储空间。"
            return persisted
        }
    }

    fun setActiveClaim(claimId: String) {
        if (claimId.isBlank() || authenticatedUserId.isNullOrBlank()) return
        _activeClaimId.value = claimId
        _uploadMessage.value = null
        _error.value = null
    }

    fun clearActiveClaim() {
        _activeClaimId.value = null
    }

    fun clearAuthenticatedUser() {
        synchronized(persistenceLock) {
            authenticatedUserId = null
            _activeClaimId.value = null
        }
    }

    fun markLastCaptureUploaded(message: String) {
        synchronized(persistenceLock) {
            val completedPath = _lastCapturePath.value
            clearPersistedEvidence(preferences)
            _lastCapturePath.value = null
            _pendingIdempotencyKey.value = null
            _lastCaptureClaimId.value = null
            _uploadMessage.value = message
            _error.value = null
            _activeClaimId.value = null
            deleteManagedEvidenceFile(completedPath)
        }
    }

    fun clearLastCapture() {
        synchronized(persistenceLock) {
            val pendingPath = _lastCapturePath.value
            clearPersistedEvidence(preferences)
            clearInMemoryEvidence()
            _activeClaimId.value = null
            if (!pendingPath.isNullOrBlank()) deleteManagedEvidenceFile(pendingPath)
        }
    }

    private fun isManagedEvidenceFile(path: String?): Boolean {
        if (path.isNullOrBlank()) return false
        return runCatching {
            val root = File(appFilesDir, "task-evidence").canonicalFile
            val candidate = File(path).canonicalFile
            candidate.path.startsWith(root.path + File.separator)
        }.getOrDefault(false)
    }

    private fun deleteManagedEvidenceFile(path: String?) {
        if (isManagedEvidenceFile(path)) runCatching { File(path!!).delete() }
    }

    private fun clearPersistedEvidence(prefs: SharedPreferences?) {
        prefs?.edit()
            ?.remove(KEY_NAME)
            ?.remove(KEY_PATH)
            ?.remove(KEY_CLAIM_ID)
            ?.remove(KEY_IDEMPOTENCY)
            ?.remove(KEY_OWNER_USER_ID)
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
