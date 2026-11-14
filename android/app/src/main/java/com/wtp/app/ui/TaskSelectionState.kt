package com.wtp.app.ui

/**
 * Viewing a historical claim must not detach the screenshot session from a
 * different claim that is currently being executed.
 */
internal fun shouldClearActiveClaimOnViewDetails(activeClaimId: String?, viewedClaimId: String): Boolean =
    !activeClaimId.isNullOrBlank() && activeClaimId == viewedClaimId
