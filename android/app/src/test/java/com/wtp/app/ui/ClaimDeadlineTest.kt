package com.wtp.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClaimDeadlineTest {
    private val claimedAt = "2026-11-05T10:00:00Z"

    @Test
    fun claimedTaskExpiresAfterThreeMinutesWhenServerDeadlineMissing() {
        assertEquals(
            InstantMillis.parse("2026-11-05T10:03:00Z"),
            ClaimDeadline.expiryMillis("CLAIMED", null, claimedAt)
        )
    }

    @Test
    fun serverDeadlineTakesPrecedenceOverLegacyFallback() {
        assertEquals(
            InstantMillis.parse("2026-11-05T10:05:00Z"),
            ClaimDeadline.expiryMillis("IN_PROGRESS", "2026-11-05T10:05:00Z", claimedAt)
        )
    }

    @Test
    fun expiredAtBoundaryIsExpired() {
        assertTrue(
            ClaimDeadline.isExpired(
                "REJECTED",
                "2026-11-05T10:03:00Z",
                claimedAt,
                InstantMillis.parse("2026-11-05T10:03:00Z")
            )
        )
    }

    @Test
    fun submittedAndUnderReviewClaimsDoNotExpire() {
        for (status in listOf("SUBMITTED", "UNDER_REVIEW", "APPROVED")) {
            assertFalse(
                ClaimDeadline.isExpired(
                    status,
                    "2026-11-05T09:00:00Z",
                    claimedAt,
                    InstantMillis.parse("2026-11-05T10:10:00Z")
                )
            )
        }
    }

    @Test
    fun invalidDeadlineFallsBackToClaimedAt() {
        assertEquals(
            InstantMillis.parse("2026-11-05T10:03:00Z"),
            ClaimDeadline.expiryMillis("CLAIMED", "not-a-date", claimedAt)
        )
    }

    @Test
    fun missingBothDatesDoesNotInventAnExpiry() {
        assertFalse(ClaimDeadline.isExpired("CLAIMED", null, null, Long.MAX_VALUE))
    }
}

private object InstantMillis {
    fun parse(value: String): Long = java.time.Instant.parse(value).toEpochMilli()
}
