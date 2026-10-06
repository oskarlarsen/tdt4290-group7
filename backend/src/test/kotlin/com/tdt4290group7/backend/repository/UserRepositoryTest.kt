package com.tdt4290group7.backend.repository

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

// Seed passwords come from the test env in build.gradle.kts.
class UserRepositoryTest {
    private val email = "advisor.hansen@kommune.no"

    @Test
    fun `correct password returns the user`() {
        assertEquals(email, UserRepository.authenticate(email, "test-only-admin-password")?.email)
    }

    @Test
    fun `email lookup ignores case and surrounding spaces`() {
        assertEquals(email, UserRepository.authenticate("  Advisor.Hansen@Kommune.no ", "test-only-admin-password")?.email)
    }

    @Test
    fun `wrong password, unknown email and over-long password all return null`() {
        assertNull(UserRepository.authenticate(email, "wrong-password"))
        assertNull(UserRepository.authenticate("nobody@example.no", "test-only-admin-password"))
        assertNull(UserRepository.authenticate(email, "a".repeat(100)))
    }
}
