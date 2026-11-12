package com.tdt4290group7.backend.vehicles

import java.nio.file.Path
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import kotlin.test.*

class FleetRepositoryTest {
    private val actor = ChangeActor("admin-id", "Test admin")
    private val now = Instant.parse("2026-01-01T10:00:00Z")
    private fun repository() = VehicleRepository(Path.of("build", "test-data", "fleet-${UUID.randomUUID()}.db"))
    private fun agreement(repo: VehicleRepository, capacity: Int = 2): FleetAgreement {
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("Test supplier", "123456789"), actor, now)
        return repo.fleet.saveAgreement(null, AgreementInput(supplier.id, "2026-01-01", "2026-12-31", capacity, saksnr = "2024/1234"), null, actor, now)
    }

    @Test fun capacityIncludesPlannedVehiclesAndFailedAddsAreAtomic() {
        val repo = repository(); val agreement = agreement(repo)
        repo.fleet.addVehicle(agreement.id, VehicleEntryInput("ab 12345"), actor, now)
        val planned = repo.fleet.addVehicle(agreement.id, VehicleEntryInput(planned = true), actor, now.plusSeconds(1))
        assertTrue(planned.registrationNumber.startsWith("PLAN")); assertTrue(planned.planned)
        val before = repo.fleet.overview()
        assertFailsWith<FleetConflictException> { repo.fleet.addVehicle(agreement.id, VehicleEntryInput("CD12345"), actor, now.plusSeconds(2)) }
        assertEquals(before, repo.fleet.overview())
        assertFailsWith<IllegalArgumentException> { repo.findOrCreateVehicle(planned.registrationNumber, now) }
        assertFailsWith<IllegalArgumentException> { repo.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip(planned.registrationNumber))), now) }
    }

    @Test fun exceptionForAReportedUnlistedVehicleIsInHistoryAndCanBeUndone() {
        val repo = repository(); val agreement = agreement(repo)
        val vehicle = repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, now)
        repo.fleet.removeVehicle(vehicle.registrationNumber, vehicle.updatedAt, actor, now.plusSeconds(1)) // now unlisted
        assertFailsWith<FleetConflictException> { repo.fleet.approveException("AB12345", null, actor, now.plusSeconds(2)) } // not reported yet
        repo.database.write { db -> repo.database.insert(db, "vehicle_usage_details", mapOf("usage_id" to "AB12345|${agreement.id}",
            "fuel_technology" to "2", "is_hybrid" to 0, "full_contract_coverage" to 1, "updated_at" to "2026-01-01T10:00:00Z")) }
        repo.fleet.approveException("AB12345", "Fine for the winter period", actor, now.plusSeconds(3))
        assertTrue(repo.fleet.overview().vehicles.single { it.registrationNumber == "AB12345" }.exceptionApproved)
        assertEquals("Fine for the winter period", repo.fleet.overview().vehicles.single { it.registrationNumber == "AB12345" }.exceptionNote)
        val change = repo.fleet.history(1).first()
        assertEquals("Approved exception for AB12345", change.description)
        repo.fleet.undo(change.id, actor, now.plusSeconds(4))
        assertFalse(repo.fleet.overview().vehicles.single { it.registrationNumber == "AB12345" }.exceptionApproved)
    }

    @Test fun lowerAllowanceKeepsVehiclesAndAllowsReplacementButBlocksNewPlaces() {
        val repo = repository(); val agreement = agreement(repo, 1)
        val old = repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, now)
        repo.fleet.saveAgreement(agreement.id, AgreementInput(agreement.supplierId, agreement.startDate, agreement.endDate, 0, saksnr = "2024/1234"), agreement.updatedAt, actor, now.plusSeconds(1))
        assertEquals(1, repo.fleet.overview().vehicles.count { it.listed })
        assertFailsWith<FleetConflictException> { repo.fleet.addVehicle(agreement.id, VehicleEntryInput("CD12345"), actor, now) }
        val replacement = repo.fleet.replaceVehicle(old.registrationNumber, ReplacementRequest(VehicleEntryInput("CD12345"), old.updatedAt), actor, now.plusSeconds(2))
        assertTrue(replacement.listed)
        assertEquals(1, repo.fleet.overview().vehicles.count { it.listed })
        assertFalse(repo.fleet.overview().vehicles.single { it.registrationNumber == old.registrationNumber }.listed)
    }

    @Test fun replacementAndItsUndoPreserveStatisticsAndRecordBothActions() {
        val repo = repository(); val agreement = agreement(repo, 1)
        val old = repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, now)
        val statistics = repo.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip())), now)
        repo.fleet.replaceVehicle(old.registrationNumber, ReplacementRequest(VehicleEntryInput(planned = true), old.updatedAt), actor, now.plusSeconds(1))
        val change = repo.fleet.overview().changes.first()
        assertTrue(change.canUndo)
        repo.fleet.undo(change.id, actor, now.plusSeconds(2))
        val restored = repo.fleet.overview()
        assertEquals("AB12345", restored.vehicles.single { it.listed }.registrationNumber)
        assertEquals(statistics.rows, repo.tripRowsForVehicle("AB12345"))
        assertEquals(change.id, restored.changes.first().undoOf)
        assertNotNull(restored.changes.single { it.id == change.id }.reversedBy)
        assertFailsWith<FleetConflictException> { repo.fleet.undo(change.id, actor, now.plusSeconds(3)) }
    }

    @Test fun plannedVehicleCanBeRegisteredAndUndoneWithoutCreatingExtraPlaces() {
        val repo = repository(); val agreement = agreement(repo, 1)
        val planned = repo.fleet.addVehicle(agreement.id, VehicleEntryInput(planned = true), actor, now)
        repo.fleet.replaceVehicle(planned.registrationNumber, ReplacementRequest(VehicleEntryInput("AB12345"), planned.updatedAt), actor, now.plusSeconds(1))
        assertEquals(1, repo.fleet.overview().vehicles.count { it.listed && !it.planned })
        val change = repo.fleet.overview().changes.first()
        repo.fleet.undo(change.id, actor, now.plusSeconds(2))
        assertEquals(planned.registrationNumber, repo.fleet.overview().vehicles.single { it.listed }.registrationNumber)
    }

    @Test fun aTruckIsListedOncePerAgreementAndInvalidReplacementNeverRemovesOriginal() {
        val repo = repository(); val first = agreement(repo)
        val second = repo.fleet.saveAgreement(null, AgreementInput(first.supplierId, first.startDate, first.endDate, 2, saksnr = "2024/1234"), null, actor, now)
        val old = repo.fleet.addVehicle(first.id, VehicleEntryInput("AB12345"), actor, now)
        assertFailsWith<FleetConflictException> { repo.fleet.addVehicle(first.id, VehicleEntryInput("AB12345"), actor, now) }
        assertFailsWith<IllegalArgumentException> { repo.fleet.replaceVehicle(old.registrationNumber, ReplacementRequest(VehicleEntryInput("invalid"), old.updatedAt), actor, now.plusSeconds(1)) }
        assertTrue(repo.fleet.overview().vehicles.single().listed)
        repo.fleet.removeVehicle(old.registrationNumber, old.updatedAt, actor, now.plusSeconds(2))
        // Removed from the first agreement, the truck can be listed under the second, and back under the first.
        repo.fleet.addVehicle(second.id, VehicleEntryInput("AB12345"), actor, now.plusSeconds(3))
        repo.fleet.addVehicle(first.id, VehicleEntryInput("AB12345"), actor, now.plusSeconds(4))
        assertEquals(setOf(first.id, second.id), repo.fleet.overview().vehicles.filter { it.listed }.map { it.agreementId }.toSet())
    }

    @Test fun theSameTruckCanBeListedUnderSeveralAgreementsAndEachListingIsHandledOnItsOwn() {
        val repo = repository(); val first = agreement(repo, 1)
        val otherSupplier = repo.fleet.saveSupplier(null, SupplierInput("Second Supplier AS", "987654321"), actor, now)
        val second = repo.fleet.saveAgreement(null, AgreementInput(otherSupplier.id, first.startDate, first.endDate, 1, saksnr = "2024/9999"), null, actor, now)

        val a = repo.fleet.addVehicle(first.id, VehicleEntryInput("AB12345"), actor, now)
        val b = repo.fleet.addVehicle(second.id, VehicleEntryInput("AB12345"), actor, now.plusSeconds(1))
        assertEquals(listOf(first.id, second.id), repo.fleet.overview().vehicles.filter { it.registrationNumber == "AB12345" && it.listed }.map { it.agreementId }.sortedBy { if (it == first.id) 0 else 1 })
        // Each agreement counts the truck against its own allowance.
        val full = assertFailsWith<FleetConflictException> { repo.fleet.addVehicle(first.id, VehicleEntryInput("CD12345"), actor, now.plusSeconds(2)) }
        assertEquals("Vehicle allowance reached", full.message)

        // Several listings: the caller must say which one.
        assertFailsWith<IllegalArgumentException> { repo.fleet.removeVehicle("AB12345", a.updatedAt, actor, now.plusSeconds(3)) }
        repo.fleet.removeVehicle("AB12345", a.updatedAt, actor, now.plusSeconds(3), first.id)
        val remaining = repo.fleet.overview().vehicles.filter { it.listed }
        assertEquals(listOf(second.id), remaining.map { it.agreementId }, "the other supplier's listing is untouched")
        assertEquals(b.updatedAt, remaining.single().updatedAt)

        // Without a say, a single remaining listing is found by itself.
        repo.fleet.removeVehicle("AB12345", b.updatedAt, actor, now.plusSeconds(4))
        assertTrue(repo.fleet.overview().vehicles.none { it.listed })
    }

    @Test fun theBestFittingListingIsUsedUnlessTheCallerNamesAnAgreement() {
        val repo = repository()
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("Fit AS", "246813579"), actor, now)
        val past = repo.fleet.saveAgreement(null, AgreementInput(supplier.id, "2020-01-01", "2020-12-31", 2, saksnr = "2020/1"), null, actor, now)
        val current = repo.fleet.saveAgreement(null, AgreementInput(supplier.id, "2020-01-01", "2099-12-31", 2, saksnr = "2025/1"), null, actor, now)
        repo.fleet.addVehicle(past.id, VehicleEntryInput("AB12345"), actor, now)
        repo.fleet.addVehicle(current.id, VehicleEntryInput("AB12345"), actor, now)
        assertEquals(current.id, repo.vehicleDetails("AB12345")!!.agreement!!.agreement.id)
        assertEquals(past.id, repo.vehicleDetails("AB12345", past.id)!!.agreement!!.agreement.id)
        assertNull(repo.vehicleDetails("AB12345", "no-such-agreement"))
    }

    @Test fun concurrentAdditionsCannotExceedCapacityAcrossConnections() {
        val repo = repository(); val agreement = agreement(repo, 1)
        val ready = CountDownLatch(6); val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(6)
        try {
            val futures = (0..5).map { index -> executor.submit<Boolean> {
                ready.countDown(); start.await()
                try { repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB${12340 + index}"), actor, now); true }
                catch (_: FleetConflictException) { false }
            } }
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown()
            assertEquals(1, futures.count { it.get(15, TimeUnit.SECONDS) })
            assertEquals(1, repo.fleet.overview().vehicles.count { it.listed })
        } finally { executor.shutdownNow() }
    }

    @Test fun laterChangesPreventUndoAndStaleEditsAreRejected() {
        val repo = repository(); val agreement = agreement(repo)
        val old = repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, now)
        val addition = repo.fleet.overview().changes.first()
        repo.fleet.replaceVehicle(old.registrationNumber, ReplacementRequest(VehicleEntryInput("CD12345"), old.updatedAt), actor, now.plusSeconds(1))
        assertFalse(repo.fleet.overview().changes.single { it.id == addition.id }.canUndo)
        assertFailsWith<FleetConflictException> { repo.fleet.undo(addition.id, actor, now.plusSeconds(2)) }
        assertFailsWith<FleetConflictException> { repo.fleet.removeVehicle("CD12345", old.updatedAt, actor, now.plusSeconds(3)) }
    }

    @Test fun removingAgreementAndUndoRestoreItsVehicleList() {
        val repo = repository(); val agreement = agreement(repo)
        repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, now)
        repo.fleet.removeAgreement(agreement.id, agreement.updatedAt, actor, now.plusSeconds(1))
        val removal = repo.fleet.overview().changes.first()
        assertTrue(repo.fleet.overview().agreements.isEmpty())
        assertFalse(repo.fleet.overview().vehicles.single().listed)
        assertTrue(removal.canUndo)
        repo.fleet.undo(removal.id, actor, now.plusSeconds(2))
        assertEquals(agreement.id, repo.fleet.overview().agreements.single().id)
        assertTrue(repo.fleet.overview().vehicles.single().listed)
    }

    @Test fun removingSupplierDeactivatesAgreementsAndVehiclesAndCanBeUndone() {
        val repo = repository()
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("Supplier to remove", "123456789"), actor, now)
        val agreements = (1..2).map {
            repo.fleet.saveAgreement(null, AgreementInput(supplier.id, "2026-01-01", "2026-12-31", 2, saksnr = "2024/1234"), null, actor, now)
        }
        agreements.forEachIndexed { index, agreement ->
            repo.fleet.addVehicle(agreement.id, VehicleEntryInput(if (index == 0) "AB12345" else "CD12345"), actor, now)
        }

        repo.fleet.removeSupplier(supplier.id, supplier.updatedAt!!, actor, now.plusSeconds(1))

        val removed = repo.fleet.overview()
        assertTrue(removed.suppliers.isEmpty())
        assertTrue(removed.agreements.isEmpty())
        assertTrue(removed.vehicles.none { it.listed })
        val removal = removed.changes.first()
        assertTrue(removal.canUndo)
        assertFalse(repo.fleet.isSupplierActive(supplier.id))

        repo.fleet.undo(removal.id, actor, now.plusSeconds(2))
        val restored = repo.fleet.overview()
        assertEquals(1, restored.suppliers.size)
        assertEquals(2, restored.agreements.size)
        assertEquals(2, restored.vehicles.count { it.listed })
        assertTrue(repo.fleet.isSupplierActive(supplier.id))
    }

    @Test fun removingSupplierRejectsStaleVersionWithoutChangingAnyRecords() {
        val repo = repository()
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("Supplier", "123456789"), actor, now)
        repo.fleet.saveSupplier(supplier.id, SupplierInput("Updated", "123456789"), actor, now.plusSeconds(1), supplier.updatedAt)
        val before = repo.fleet.overview()

        assertFailsWith<FleetConflictException> {
            repo.fleet.removeSupplier(supplier.id, supplier.updatedAt!!, actor, now.plusSeconds(2))
        }
        assertEquals(before, repo.fleet.overview())
    }


    @Test fun supplierEditsCanBeUndoneUnlessTheirPreviousOrganizationNumberWasReused() {
        val repo = repository()
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("First name", "123456789"), actor, now)
        repo.fleet.saveSupplier(supplier.id, SupplierInput("Second name", "987654321"), actor, now.plusSeconds(1), supplier.updatedAt)
        val edit = repo.fleet.history(1).first()
        repo.fleet.undo(edit.id, actor, now.plusSeconds(2))
        assertEquals("First name", repo.fleet.overview().suppliers.single().name)
        repo.fleet.saveSupplier(supplier.id, SupplierInput("Third name", "987654321"), actor, now.plusSeconds(3), repo.fleet.overview().suppliers.single().updatedAt)
        val next = repo.fleet.history(1).first()
        repo.fleet.saveSupplier(null, SupplierInput("Other supplier", "123456789"), actor, now.plusSeconds(4))
        assertFalse(repo.fleet.history(1).single { it.id == next.id }.canUndo)
        assertFailsWith<FleetConflictException> { repo.fleet.undo(next.id, actor, now.plusSeconds(5)) }
    }

    @Test fun staleSupplierEditsDoNotOverwriteDataOrRecordAuditChanges() {
        val repo = repository()
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("Original", "123456789"), actor, now)
        val updated = repo.fleet.saveSupplier(supplier.id, SupplierInput("First administrator", "123456789"), actor,
            now.plusSeconds(1), supplier.updatedAt)
        val before = repo.fleet.overview()
        assertFailsWith<FleetConflictException> {
            repo.fleet.saveSupplier(supplier.id, SupplierInput("Stale edit", "987654321"), actor, now.plusSeconds(2), supplier.updatedAt)
        }
        assertEquals(before, repo.fleet.overview())
        val saved = repo.fleet.saveSupplier(supplier.id, SupplierInput("Current edit", "123456789"), actor, now.plusSeconds(3), updated.updatedAt)
        assertEquals("Current edit", saved.name)
        assertEquals(now.plusSeconds(3).storageTimestamp(), saved.updatedAt)
    }

    @Test fun frozenCheckSurvivesAgreementEditsReplacementUndoAndRepositoryRestart() = runBlocking {
        val path = Path.of("build", "test-data", "history-${UUID.randomUUID()}.db")
        val repo = VehicleRepository(path); val agreement = agreement(repo)
        val vehicle = repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, now)
        repo.appendTripRows(AppendTripRowsRequest(rows = listOf(syntheticTrip(co2GramsPerKm = "123.456".toBigDecimal(), totalTripKm = "1000".toBigDecimal()))), now)
        val check = VehicleCheckService(repo, null, clock = Clock.fixed(now, ZoneId.of("Europe/Oslo"))).check(VehicleCheckRequest("AB12345"))
        assertEquals("123.456", check.tripRows.single().estimatedCo2Kg!!.toPlainString())
        repo.fleet.saveAgreement(agreement.id, AgreementInput(agreement.supplierId, agreement.startDate, "2027-12-31", 0, "Changed", saksnr = "2024/1234"), agreement.updatedAt, actor, now.plusSeconds(1))
        repo.fleet.replaceVehicle(vehicle.registrationNumber, ReplacementRequest(VehicleEntryInput("CD12345"), vehicle.updatedAt), actor, now.plusSeconds(2))
        repo.fleet.undo(repo.fleet.overview().changes.first().id, actor, now.plusSeconds(3))
        val reopened = VehicleRepository(path)
        assertEquals(check, reopened.findCheck(check.id))
        assertTrue(reopened.fleet.history(1).any { it.undoOf != null })
    }

    @Test fun saksnrIsRequiredTrimmedAndMayBeShared() {
        val repo = repository(); val first = agreement(repo)
        val supplierId = first.supplierId
        for (bad in listOf("", "   ", "x".repeat(51))) {
            assertFailsWith<IllegalArgumentException> {
                repo.fleet.saveAgreement(null, AgreementInput(supplierId, "2026-01-01", "2026-12-31", 1, saksnr = bad), null, actor, now)
            }
        }
        val shared = repo.fleet.saveAgreement(null, AgreementInput(supplierId, "2026-01-01", "2026-12-31", 1, saksnr = "  2024/1234 "), null, actor, now)
        assertEquals("2024/1234", shared.saksnr)
        assertEquals(listOf("2024/1234", "2024/1234"), repo.fleet.overview().agreements.map { it.saksnr })
    }

    @Test fun undoAfterSaksnrEditRestoresThePreviousValue() {
        val repo = repository(); val agreement = agreement(repo)
        repo.fleet.saveAgreement(agreement.id, AgreementInput(agreement.supplierId, agreement.startDate, agreement.endDate, 2, saksnr = "2025/9999"),
            agreement.updatedAt, actor, now.plusSeconds(1))
        assertEquals("2025/9999", repo.fleet.overview().agreements.single().saksnr)
        repo.fleet.undo(repo.fleet.overview().changes.first().id, actor, now.plusSeconds(2))
        assertEquals("2024/1234", repo.fleet.overview().agreements.single().saksnr)
    }

    @Test fun agreementLabelCombinesSaksnrAndNote() {
        assertEquals("2024/1234 — Skolerute", agreementLabel("2024/1234", " Skolerute "))
        assertEquals("2024/1234", agreementLabel("2024/1234", ""))
        assertEquals("Saksnr missing — Skolerute", agreementLabel(null, "Skolerute"))
        assertEquals("Saksnr missing", agreementLabel("  ", ""))
    }
}
