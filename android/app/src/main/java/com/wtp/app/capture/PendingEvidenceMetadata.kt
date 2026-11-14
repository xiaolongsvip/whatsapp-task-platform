package com.wtp.app.capture

/**
 * Account-bound retry metadata. A screenshot is only eligible for automatic
 * restoration when every retry identifier is present and its owner matches
 * the account that has just authenticated.
 */
internal data class PendingEvidenceMetadata(
    val ownerUserId: String?,
    val path: String?,
    val claimId: String?,
    val idempotencyKey: String?,
) {
    fun canRestoreFor(authenticatedUserId: String, evidenceFileExists: Boolean): Boolean =
        authenticatedUserId.isNotBlank() &&
            ownerUserId?.isNotBlank() == true &&
            ownerUserId == authenticatedUserId &&
            path?.isNotBlank() == true &&
            claimId?.isNotBlank() == true &&
            idempotencyKey?.isNotBlank() == true &&
            evidenceFileExists
}
