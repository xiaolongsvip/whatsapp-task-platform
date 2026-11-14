package com.wtp.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class TaskClaimRequestKeysTest {
    @Test
    fun returnsTheSameKeyUntilTheClaimRequestSucceeds() {
        var sequence = 0
        val keys = TaskClaimRequestKeys { "key-${++sequence}" }

        val first = keys.getOrCreate("task-1", "slot-1")
        val retry = keys.getOrCreate("task-1", "slot-1")

        assertEquals("key-1", first)
        assertEquals(first, retry)
        assertEquals(1, sequence)
    }

    @Test
    fun differentTaskOrSlotGetsAnIndependentKey() {
        var sequence = 0
        val keys = TaskClaimRequestKeys { "key-${++sequence}" }

        val first = keys.getOrCreate("task-1", "slot-1")
        val differentSlot = keys.getOrCreate("task-1", "slot-2")
        val differentTask = keys.getOrCreate("task-2", "slot-1")

        assertNotEquals(first, differentSlot)
        assertNotEquals(first, differentTask)
        assertEquals(3, sequence)
    }

    @Test
    fun successfulRequestClearsOnlyItsOwnRetryKey() {
        var sequence = 0
        val keys = TaskClaimRequestKeys { "key-${++sequence}" }

        val first = keys.getOrCreate("task-1", "slot-1")
        val other = keys.getOrCreate("task-1", "slot-2")
        keys.markSucceeded("task-1", "slot-1")

        val nextIntent = keys.getOrCreate("task-1", "slot-1")
        assertNotEquals(first, nextIntent)
        assertEquals(other, keys.getOrCreate("task-1", "slot-2"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankTaskId() {
        TaskClaimRequestKeys { "key" }.getOrCreate("", "slot-1")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBlankSlotId() {
        TaskClaimRequestKeys { "key" }.getOrCreate("task-1", "")
    }
}
