package com.wtp.app.capture

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-process state for the user-authorized capture session and the task
 * explicitly selected for evidence submission. The MediaProjection consent
 * token is never persisted.
 */
object CaptureSessionState {
    private val _active = MutableStateFlow(false)
    val active = _active.asStateFlow()

    private val _lastCaptureName = MutableStateFlow<String?>(null)
    val lastCaptureName = _lastCaptureName.asStateFlow()

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

    internal fun setActive(value: Boolean) {
        _active.value = value
    }

    internal fun setLastCapture(name: String, path: String, idempotencyKey: String) {
        _lastCaptureName.value = name
        _lastCapturePath.value = path
        _pendingIdempotencyKey.value = idempotencyKey
        _uploadMessage.value = null
        _error.value = null
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
        _lastCapturePath.value = null
        _pendingIdempotencyKey.value = null
        _uploadMessage.value = message
        _error.value = null
        _activeClaimId.value = null
    }

    fun clearLastCapture() {
        _lastCaptureName.value = null
        _lastCapturePath.value = null
        _pendingIdempotencyKey.value = null
        _uploadMessage.value = null
    }

    internal fun setError(message: String?) {
        _error.value = message
    }
}
