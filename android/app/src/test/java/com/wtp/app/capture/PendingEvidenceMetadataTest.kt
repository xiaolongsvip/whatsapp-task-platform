package com.wtp.app.capture

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingEvidenceMetadataTest {
    private fun complete(owner: String? = "user-101") = PendingEvidenceMetadata(
        ownerUserId = owner,
        path = "/data/user/0/com.wtp.app/files/task-evidence/capture.jpg",
        claimId = "claim-202",
        idempotencyKey = "stable-idempotency-key",
    )

    @Test
    fun restoresOnlyForTheSameAuthenticatedMember() {
        assertTrue(complete().canRestoreFor("user-101", evidenceFileExists = true))
        assertFalse(complete().canRestoreFor("user-999", evidenceFileExists = true))
    }

    @Test
    fun refusesLegacyOrMissingOwnerMetadata() {
        assertFalse(complete(owner = null).canRestoreFor("user-101", evidenceFileExists = true))
        assertFalse(complete(owner = "").canRestoreFor("user-101", evidenceFileExists = true))
    }

    @Test
    fun refusesIncompleteRetryIdentity() {
        val incomplete = complete().copy(claimId = null)
        assertFalse(incomplete.canRestoreFor("user-101", evidenceFileExists = true))
        assertFalse(complete().copy(idempotencyKey = "").canRestoreFor("user-101", evidenceFileExists = true))
        assertFalse(complete().copy(path = "").canRestoreFor("user-101", evidenceFileExists = true))
    }

    @Test
    fun refusesRetryWhenScreenshotFileNoLongerExists() {
        assertFalse(complete().canRestoreFor("user-101", evidenceFileExists = false))
    }

    @Test
    fun retainsTheOriginalClaimAndIdempotencyKeyForRetry() {
        val pending = complete()
        assertTrue(pending.canRestoreFor("user-101", evidenceFileExists = true))
        assertTrue(pending.claimId == "claim-202")
        assertTrue(pending.idempotencyKey == "stable-idempotency-key")
    }
}
