package com.wtp.app.ui

import java.util.UUID

/**
 * Reuses the same idempotency key while a claim request's outcome is unknown.
 * The task and slot are both part of the key scope because an available slot
 * can later be reassigned to a different task.
 */
class TaskClaimRequestKeys(
    private val newKey: () -> String = { UUID.randomUUID().toString() },
) {
    private val keys = mutableMapOf<String, String>()

    @Synchronized
    fun getOrCreate(taskId: String, slotId: String): String {
        require(taskId.isNotBlank()) { "taskId must not be blank" }
        require(slotId.isNotBlank()) { "slotId must not be blank" }
        val scope = "$taskId:$slotId"
        return keys.getOrPut(scope, newKey)
    }

    @Synchronized
    fun markSucceeded(taskId: String, slotId: String) {
        if (taskId.isBlank() || slotId.isBlank()) return
        keys.remove("$taskId:$slotId")
    }

    @Synchronized
    fun clear() {
        keys.clear()
    }
}
