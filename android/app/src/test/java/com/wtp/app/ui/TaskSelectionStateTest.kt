package com.wtp.app.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskSelectionStateTest {
    @Test
    fun viewingTheCurrentlyBoundClaimCanClearItsSelection() {
        assertTrue(shouldClearActiveClaimOnViewDetails("claim-a", "claim-a"))
    }

    @Test
    fun viewingAnotherClaimPreservesTheCurrentCaptureBinding() {
        assertFalse(shouldClearActiveClaimOnViewDetails("claim-a", "claim-b"))
    }

    @Test
    fun viewingHistoryDoesNotClearWhenNoClaimIsBound() {
        assertFalse(shouldClearActiveClaimOnViewDetails(null, "claim-b"))
        assertFalse(shouldClearActiveClaimOnViewDetails("", "claim-b"))
    }
}
