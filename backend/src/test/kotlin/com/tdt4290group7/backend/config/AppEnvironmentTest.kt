package com.tdt4290group7.backend.config

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppEnvironmentTest {
    @Test
    fun `unset or blank APP_ENV defaults to prod`() {
        assertEquals(AppEnvironment.PROD, AppEnvironment.parse(null))
        assertEquals(AppEnvironment.PROD, AppEnvironment.parse("  "))
    }

    @Test
    fun `dev and prod are accepted case-insensitively`() {
        assertEquals(AppEnvironment.DEV, AppEnvironment.parse(" Dev "))
        assertEquals(AppEnvironment.PROD, AppEnvironment.parse("PROD"))
    }

    @Test
    fun `anything else is rejected`() {
        listOf("development", "production", "staging", "true").forEach { raw ->
            assertFailsWith<IllegalArgumentException>("should reject '$raw'") { AppEnvironment.parse(raw) }
        }
    }

    @Test
    fun `reset token logging is off unless explicitly true`() {
        listOf(null, "", "false", "1", "yes").forEach { flag ->
            assertFalse(resetTokenLoggingEnabled(AppEnvironment.DEV, flag), "flag '$flag'")
            assertFalse(resetTokenLoggingEnabled(AppEnvironment.PROD, flag), "flag '$flag'")
        }
    }

    @Test
    fun `reset token logging is allowed in dev`() {
        assertTrue(resetTokenLoggingEnabled(AppEnvironment.DEV, "true"))
        assertTrue(resetTokenLoggingEnabled(AppEnvironment.DEV, "TRUE"))
    }

    @Test
    fun `reset token logging in prod stops startup`() {
        assertFailsWith<IllegalArgumentException> { resetTokenLoggingEnabled(AppEnvironment.PROD, "true") }
    }
}
