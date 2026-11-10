package com.tdt4290group7.backend.repository

import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.model.User
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SharedAccessTest {
    private val now = Instant.parse("2026-06-01T10:00:00Z")
    private val admin: User get() = UserRepository.findByEmail("advisor.hansen@kommune.no")!!

    private fun supplierOwner(supplierId: String = UUID.randomUUID().toString()): User {
        val email = "owner-${UUID.randomUUID()}@example.no"
        val invitation = UserRepository.createSupplierInvitation(supplierId, "Access Transport AS", email, now)
        UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now)
        return UserRepository.findByEmail(email)!!
    }

    private fun invite(inviter: User, end: LocalDate?, at: Instant = now): User {
        val email = "guest-${UUID.randomUUID()}@example.no"
        val invitation = UserRepository.createAccessInvitation(inviter, email, "Access Transport AS", end, at)
        val user = UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", at, name = "Kari Nordmann")
        return assertNotNull(user)
    }

    @Test
    fun accessEndsAtMidnightOsloAfterTheEndDateAcrossDaylightSavingChanges() {
        assertEquals(Instant.parse("2026-06-10T22:00:00Z"), UserRepository.accessExpiryFor(LocalDate.of(2026, 6, 10)))
        assertEquals(Instant.parse("2026-10-25T23:00:00Z"), UserRepository.accessExpiryFor(LocalDate.of(2026, 10, 25)))
        assertEquals(Instant.parse("2027-03-27T23:00:00Z"), UserRepository.accessExpiryFor(LocalDate.of(2027, 3, 27)))
    }

    @Test
    fun aStandInHasAccessUntilTheEndOfTheEndDateAndNotAfter() {
        val owner = supplierOwner()
        val standIn = invite(owner, LocalDate.of(2026, 6, 10))
        assertEquals("Kari Nordmann", standIn.name)
        assertEquals(owner.id, standIn.grantedBy)
        assertEquals(Role.SUPPLIER, standIn.role)
        assertEquals(owner.supplierId, standIn.supplierId)
        assertTrue(UserRepository.isAccessActive(standIn, Instant.parse("2026-06-10T21:59:59Z")))
        assertFalse(UserRepository.isAccessActive(standIn, Instant.parse("2026-06-10T22:00:00Z")))
        assertTrue(UserRepository.isAccessActive(owner, Instant.parse("2030-01-01T00:00:00Z")))
    }

    @Test
    fun aGrantIsLimitedToNinetyDaysAndCannotOutlastTheGranter() {
        val owner = supplierOwner()
        val email = { "x-${UUID.randomUUID()}@example.no" }
        assertFailsWith<IllegalArgumentException> { UserRepository.createAccessInvitation(owner, email(), "S", LocalDate.of(2026, 8, 31), now) } // 91 days
        UserRepository.createAccessInvitation(owner, email(), "S", LocalDate.of(2026, 8, 30), now) // 90 days
        assertFailsWith<IllegalArgumentException> { UserRepository.createAccessInvitation(owner, email(), "S", LocalDate.of(2026, 5, 31), now) } // in the past

        val standIn = invite(owner, LocalDate.of(2026, 6, 20))
        assertFailsWith<IllegalArgumentException> { UserRepository.createAccessInvitation(standIn, email(), "S", LocalDate.of(2026, 6, 21), now) }
        // With no end date, a stand-in can only pass on access that ends with its own.
        val passedOn = invite(standIn, null)
        assertEquals(UserRepository.accessExpiryFor(LocalDate.of(2026, 6, 20)), passedOn.accessExpiresAt)
        // A permanent user can invite someone with no end date at all.
        assertNull(invite(owner, null).accessExpiresAt)
    }

    @Test
    fun revokingTheGranterEndsUnapprovedGrantsAndAnAdminApprovalKeepsThem() {
        val owner = supplierOwner()
        val standIn = invite(owner, LocalDate.of(2026, 6, 20))
        val unapproved = invite(standIn, LocalDate.of(2026, 6, 15))
        val approved = invite(standIn, LocalDate.of(2026, 6, 15))
        UserRepository.approveAccess(admin, approved.id, now)

        UserRepository.revokeAccess(owner, standIn.id, now.plusSeconds(60))
        val later = now.plusSeconds(120)
        assertFalse(UserRepository.isAccessActive(UserRepository.findById(standIn.id)!!, later))
        assertFalse(UserRepository.isAccessActive(UserRepository.findById(unapproved.id)!!, later))
        assertTrue(UserRepository.isAccessActive(UserRepository.findById(approved.id)!!, later))
        // Approved access still ends on its own date.
        assertFalse(UserRepository.isAccessActive(UserRepository.findById(approved.id)!!, Instant.parse("2026-06-15T22:00:00Z")))
    }

    @Test
    fun onlyTheGranterOrAnAdminCanRemoveAccessAndThePermanentAdminCannotBeRemoved() {
        val owner = supplierOwner()
        val colleague = invite(owner, LocalDate.of(2026, 6, 20))
        val other = supplierOwner()
        assertFailsWith<IllegalArgumentException> { UserRepository.revokeAccess(other, colleague.id, now) }
        assertFailsWith<IllegalArgumentException> { UserRepository.revokeAccess(colleague, colleague.id, now) }
        assertFailsWith<IllegalArgumentException> { UserRepository.revokeAccess(admin, admin.id, now) }
        assertFailsWith<IllegalArgumentException> { UserRepository.revokeAccess(owner, admin.id, now) }
        assertTrue(admin.permanent)
        UserRepository.revokeAccess(admin, colleague.id, now.plusSeconds(1))
        assertFalse(UserRepository.isAccessActive(UserRepository.findById(colleague.id)!!, now.plusSeconds(2)))
    }

    @Test
    fun renewalIsOnlyOfferedCloseToExpiryAndNeverToTheStandInThemselves() {
        val owner = supplierOwner()
        val standIn = invite(owner, LocalDate.of(2026, 6, 30))
        val farFuture = LocalDate.of(2026, 8, 1)
        assertFailsWith<IllegalArgumentException> { UserRepository.renewAccess(owner, standIn.id, farFuture, now) } // 29 days left
        val closeToEnd = Instant.parse("2026-06-20T10:00:00Z") // 10 days left
        assertFailsWith<IllegalArgumentException> { UserRepository.renewAccess(standIn, standIn.id, farFuture, closeToEnd) }
        UserRepository.renewAccess(owner, standIn.id, LocalDate.of(2026, 7, 15), closeToEnd)
        assertEquals(UserRepository.accessExpiryFor(LocalDate.of(2026, 7, 15)), UserRepository.findById(standIn.id)!!.accessExpiresAt)
        // An admin can renew too, but still within 90 days.
        assertFailsWith<IllegalArgumentException> { UserRepository.renewAccess(admin, standIn.id, LocalDate.of(2026, 12, 1), Instant.parse("2026-07-10T10:00:00Z")) }
    }

    @Test
    fun pendingInvitationsListOnlyOpenOnesAndStayInsideTheOrganization() {
        val owner = supplierOwner(); val rival = supplierOwner()
        val open = "open-${UUID.randomUUID()}@example.no"
        UserRepository.createAccessInvitation(owner, open, "S", null, now)
        val accepted = UserRepository.createAccessInvitation(owner, "done-${UUID.randomUUID()}@example.no", "S", null, now)
        UserRepository.acceptSupplierInvitation(accepted.token, "test-only-supplier-password", now, name = "Ola")
        val mine = UserRepository.pendingInvitations(owner.supplierId, now).map { it.email }
        assertTrue(open in mine && mine.none { it.startsWith("done-") })
        assertTrue(UserRepository.pendingInvitations(rival.supplierId, now).none { it.email == open })
        assertTrue(UserRepository.pendingInvitations(owner.supplierId, now.plus(java.time.Duration.ofDays(3))).none { it.email == open })
        assertTrue(UserRepository.pendingInvitations(null, now).any { it.email == open })
        assertTrue(UserRepository.pendingInvitations(owner.supplierId, now).first { it.email == open }.let { !it.contact && it.supplierId == owner.supplierId })
    }

    @Test
    fun anAdminCanReissueAColleagueLinkInsideTheSupplierOrganization() {
        val owner = supplierOwner()
        val email = "colleague-${UUID.randomUUID()}@example.no"
        UserRepository.createAccessInvitation(owner, email, "S", null, now)
        val reissued = UserRepository.createAccessInvitation(admin, email, "S", null, now, supplierId = owner.supplierId)
        val pending = UserRepository.pendingInvitations(owner.supplierId, now).single { it.email == email }
        assertEquals(owner.supplierId, pending.supplierId)
        assertNotNull(UserRepository.acceptSupplierInvitation(reissued.token, "test-only-supplier-password", now, name = "Ola"))
        assertFailsWith<IllegalArgumentException> { UserRepository.createAccessInvitation(owner, "x-${UUID.randomUUID()}@example.no", "S", null, now, supplierId = owner.supplierId) }
    }

    @Test
    fun anotherOrganizationsPendingInvitationCannotBeCancelledOrTaken() {
        val owner = supplierOwner(); val rival = supplierOwner()
        val email = "contested-${UUID.randomUUID()}@example.no"
        val mine = UserRepository.createAccessInvitation(owner, email, "S", null, now)
        assertFailsWith<AccountConflictException> { UserRepository.createAccessInvitation(rival, email, "S", null, now) }
        assertFailsWith<AccountConflictException> { UserRepository.createAccessInvitation(admin, email, null, null, now) }
        assertFailsWith<AccountConflictException> { UserRepository.createSupplierInvitation(UUID.randomUUID().toString(), "Other", email, now) }
        assertNotNull(UserRepository.acceptSupplierInvitation(mine.token, "test-only-supplier-password", now, name = "Ola"))
    }

    @Test
    fun anAcceptedInvitationNeedsTheirOwnNameAndAnInactiveInviterCannotInvite() {
        val owner = supplierOwner()
        val email = "nameless-${UUID.randomUUID()}@example.no"
        val invitation = UserRepository.createAccessInvitation(owner, email, "S", null, now)
        assertFailsWith<IllegalArgumentException> { UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now) }
        assertFailsWith<IllegalArgumentException> { UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now, name = "  ") }
        assertNotNull(UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now, name = "Kari"))
        // The same token cannot be used twice.
        assertNull(UserRepository.acceptSupplierInvitation(invitation.token, "test-only-supplier-password", now, name = "Kari"))
    }

    @Test
    fun adminsCanInviteAdminsWithAnEndDate() {
        val email = "admin-${UUID.randomUUID()}@example.no"
        val invitation = UserRepository.createAccessInvitation(admin, email, null, LocalDate.of(2026, 6, 30), now)
        val standInAdmin = assertNotNull(UserRepository.acceptSupplierInvitation(invitation.token, "test-only-admin-password-2", now, name = "Vikar Admin"))
        assertEquals(Role.ADMIN, standInAdmin.role)
        assertNull(standInAdmin.supplierId)
        assertFalse(UserRepository.isAccessActive(standInAdmin, Instant.parse("2026-06-30T22:00:00Z")))
        // Expired accounts cannot log in either.
        assertNull(UserRepository.authenticate(email, "test-only-admin-password-2"))
    }
}
