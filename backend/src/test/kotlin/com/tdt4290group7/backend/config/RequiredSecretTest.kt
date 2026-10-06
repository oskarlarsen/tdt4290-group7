package com.tdt4290group7.backend.config

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class RequiredSecretTest {
    @Test
    fun `a set secret is returned unchanged`() {
        assertEquals(" s3cret ", requireSecret("JWT_SECRET", " s3cret "))
    }

    @Test
    fun `a missing or blank secret stops startup, naming the variable`() {
        listOf(null, "", "   ").forEach { value ->
            val error = assertFailsWith<IllegalStateException>("value '$value'") { requireSecret("JWT_SECRET", value) }
            assertTrue(error.message!!.startsWith("JWT_SECRET is not set"))
        }
    }
}
