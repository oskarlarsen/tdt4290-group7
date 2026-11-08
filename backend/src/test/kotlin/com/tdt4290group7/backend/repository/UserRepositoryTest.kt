package com.tdt4290group7.backend.repository

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.time.Instant
import java.util.UUID

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

    @Test
    fun `supplier invitation persists organization link and is single use`() {
        val now = Instant.now()
        val supplierId = UUID.randomUUID().toString()
        val email = "invite-${UUID.randomUUID()}@example.no"
        val invitation = UserRepository.createSupplierInvitation(supplierId, "Invited Transport AS", email, now)

        assertTrue(Instant.parse(invitation.expiresAt).isAfter(now))
        assertNull(UserRepository.findByEmail(email))

        val activated = UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now)
        assertNotNull(activated)
        assertEquals(email, activated.email)
        assertEquals(supplierId, activated.supplierId)
        assertEquals("SUPPLIER", activated.role.name)
        assertEquals(activated.id, UserRepository.authenticate(email, "test-only-supplier-password")?.id)
        assertNull(UserRepository.acceptSupplierInvitation(invitation.token, "another-test-password", now))
    }

    @Test
    fun `expired supplier invitation cannot be accepted`() {
        val now = Instant.now()
        val invitation = UserRepository.createSupplierInvitation(
            UUID.randomUUID().toString(),
            "Expired Transport AS",
            "expired-${UUID.randomUUID()}@example.no",
            now
        )
        assertNull(UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now.plusSeconds(48 * 60 * 60)))
    }

    @Test
    fun `pending invitation from another organization is not replaced`() {
        val now = Instant.now()
        val email = "contested-${UUID.randomUUID()}@example.no"
        val first = UserRepository.createSupplierInvitation(UUID.randomUUID().toString(), "First Transport AS", email, now)

        assertFailsWith<AccountConflictException> {
            UserRepository.createSupplierInvitation(UUID.randomUUID().toString(), "Second Transport AS", email, now)
        }
        assertNotNull(UserRepository.acceptSupplierInvitation(first.token, "test-only-supplier-password", now))
    }

    @Test
    fun `re-inviting for the same organization replaces the old invitation`() {
        val now = Instant.now()
        val supplierId = UUID.randomUUID().toString()
        val email = "reinvite-${UUID.randomUUID()}@example.no"
        val old = UserRepository.createSupplierInvitation(supplierId, "Same Transport AS", email, now)
        val new = UserRepository.createSupplierInvitation(supplierId, "Same Transport AS", email, now)

        assertNull(UserRepository.acceptSupplierInvitation(old.token, "test-only-supplier-password", now))
        assertNotNull(UserRepository.acceptSupplierInvitation(new.token, "test-only-supplier-password", now))
    }

    @Test
    fun `expired invitation from another organization does not block a new one`() {
        val now = Instant.now()
        val email = "lapsed-${UUID.randomUUID()}@example.no"
        UserRepository.createSupplierInvitation(UUID.randomUUID().toString(), "Lapsed Transport AS", email, now.minusSeconds(49 * 60 * 60))

        val invitation = UserRepository.createSupplierInvitation(UUID.randomUUID().toString(), "New Transport AS", email, now)
        assertNotNull(UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now))
    }

    private fun supplierUser(supplierId: String, now: Instant): String {
        val email = "active-${UUID.randomUUID()}@example.no"
        val invitation = UserRepository.createSupplierInvitation(supplierId, "Active Transport AS", email, now)
        UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now)
        return UserRepository.findByEmail(email)!!.id
    }

    @Test
    fun activityIsRecordedAtMostOnceAnHourAndTheSupplierShowsItsNewestCheckIn() {
        val now = Instant.parse("2026-06-01T10:00:00Z")
        val supplierId = UUID.randomUUID().toString()
        val first = supplierUser(supplierId, now)
        val second = supplierUser(supplierId, now)
        assertEquals(null, UserRepository.lastActiveBySupplier()[supplierId])

        UserRepository.recordActivity(first, now)
        UserRepository.recordActivity(first, now.plusSeconds(30 * 60)) // inside the hour: ignored
        assertEquals(now.toString(), UserRepository.lastActiveBySupplier()[supplierId])

        UserRepository.recordActivity(second, now.plusSeconds(90 * 60))
        assertEquals(now.plusSeconds(90 * 60).toString(), UserRepository.lastActiveBySupplier()[supplierId])
        UserRepository.recordActivity(first, now.plusSeconds(2 * 3600)) // an hour after its last write: recorded
        assertEquals(now.plusSeconds(2 * 3600).toString(), UserRepository.lastActiveBySupplier()[supplierId])
    }

    @Test
    fun recordingActivityForAnUnknownUserDoesNothingAndDoesNotFail() {
        UserRepository.recordActivity("no-such-user")
    }
}
