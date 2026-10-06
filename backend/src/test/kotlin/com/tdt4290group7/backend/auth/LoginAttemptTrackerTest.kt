package com.tdt4290group7.backend.auth

import java.time.Duration
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class LoginAttemptTrackerTest {
    private val start = Instant.parse("2026-01-01T00:00:00Z")

    // The tracker is a global object, so each test uses its own email.
    private fun failTimes(email: String, times: Int, at: Instant = start) =
        repeat(times) { LoginAttemptTracker.recordFailure(email, at) }

    @Test
    fun `first four failures do not lock`() {
        failTimes("four@test", 4)
        assertNull(LoginAttemptTracker.lockedFor("four@test", start))
    }

    @Test
    fun `lock doubles per failure from 30 seconds and caps at 15 minutes`() {
        val email = "backoff@test"
        val expected = listOf(30L, 60, 120, 240, 480, 900, 900)
        expected.forEachIndexed { i, seconds ->
            failTimes(email, if (i == 0) 5 else 1)
            assertEquals(Duration.ofSeconds(seconds), LoginAttemptTracker.lockedFor(email, start), "after ${5 + i} failures")
        }
    }

    @Test
    fun `lock expires`() {
        failTimes("expires@test", 5)
        assertNull(LoginAttemptTracker.lockedFor("expires@test", start.plusSeconds(30)))
    }

    @Test
    fun `success clears failures`() {
        failTimes("success@test", 4)
        LoginAttemptTracker.recordSuccess("success@test")
        failTimes("success@test", 1)
        assertNull(LoginAttemptTracker.lockedFor("success@test", start))
    }

    @Test
    fun `old failures are forgotten`() {
        failTimes("old@test", 4)
        failTimes("old@test", 1, at = start.plus(Duration.ofHours(2)))
        assertNull(LoginAttemptTracker.lockedFor("old@test", start.plus(Duration.ofHours(2))))
    }

    @Test
    fun `email is matched case-insensitively and trimmed`() {
        failTimes("Case@Test", 5)
        assertEquals(Duration.ofSeconds(30), LoginAttemptTracker.lockedFor("  case@test ", start))
    }
}
