package com.wtp.app.capture

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-process state for the user-authorized capture session and last manual
 * screenshot. The MediaProjection consent token is never persisted.
 */
object CaptureSessionState {
    private val _active = MutableStateFlow(false)
    val active = _active.asStateFlow()

    private val _lastCaptureName = MutableStateFlow<String?>(null)
    val lastCaptureName = _lastCaptureName.asStateFlow()

    private val _lastCapturePath = MutableStateFlow<String?>(null)
    val lastCapturePath = _lastCapturePath.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    internal fun setActive(value: Boolean) {
        _active.value = value
    }

    internal fun setLastCapture(name: String, path: String) {
        _lastCaptureName.value = name
        _lastCapturePath.value = path
        _error.value = null
    }

    fun clearLastCapture() {
        _lastCaptureName.value = null
        _lastCapturePath.value = null
    }

    internal fun setError(message: String?) {
        _error.value = message
    }
}
