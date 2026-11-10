package com.wtp.app.ui

import java.time.Instant

/**
 * Shared, deterministic deadline rules for active task claims.
 * Pending review states are deliberately excluded: they do not expire the
 * assigned number through the normal claim timeout path.
 */
internal object ClaimDeadline {
    private val expirableStatuses = setOf("CLAIMED", "IN_PROGRESS", "REJECTED")

    fun expiryMillis(status: String, expiresAt: String?, claimedAt: String?): Long? {
        if (status !in expirableStatuses) return null

        val serverDeadline = parseMillis(expiresAt)
        if (serverDeadline != null) return serverDeadline

        val claimedMillis = parseMillis(claimedAt) ?: return null
        return claimedMillis + 180_000L
    }

    fun isExpired(
        status: String,
        expiresAt: String?,
        claimedAt: String?,
        nowMillis: Long,
    ): Boolean = expiryMillis(status, expiresAt, claimedAt)?.let { it <= nowMillis } ?: false

    private fun parseMillis(value: String?): Long? {
        if (value.isNullOrBlank() || value == "null") return null
        return runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
    }
}
