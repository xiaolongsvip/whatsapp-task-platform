package com.wtp.app.capture

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-process UI state for the user-visible MediaProjection foreground session.
 * The consent Intent/token is deliberately never persisted.
 */
object CaptureSessionState {
    private val _active = MutableStateFlow(false)
    val active = _active.asStateFlow()

    private val _lastCaptureName = MutableStateFlow<String?>(null)
    val lastCaptureName = _lastCaptureName.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    internal fun setActive(value: Boolean) {
        _active.value = value
        if (!value) _lastCaptureName.value = null
    }

    internal fun setLastCapture(name: String) {
        _lastCaptureName.value = name
        _error.value = null
    }

    internal fun setError(message: String?) {
        _error.value = message
    }
}
