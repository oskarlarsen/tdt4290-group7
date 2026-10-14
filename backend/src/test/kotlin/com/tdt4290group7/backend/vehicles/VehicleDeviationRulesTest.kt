package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlin.test.*

class VehicleDeviationRulesTest {
    private val now = Instant.parse("2026-06-01T10:00:00Z")
    private val today = LocalDate.parse("2026-06-01")
    private fun approval(start: String, end: String? = null, fuel: FuelTechnology = FuelTechnology.DIESEL,
        category: VehicleCategory = VehicleCategory.M1, revoked: String? = null) = StoredApproval(UUID.randomUUID().toString(),
        "AB12345", createdAt = now.toString(), updatedAt = now.toString(), revokedAt = revoked,
        data = syntheticApproval(startDate = start, expiryDate = end, fuelTechnology = fuel, vehicleCategory = category))
    private fun row(input: TripRowInput = syntheticTrip("AB12345", "2026-01-01", "2026-01-31", co2Registered = true,
        co2GramsPerKm = BigDecimal("120"), totalTripKm = BigDecimal("1000"), totalKmNoxRegistered = BigDecimal("1000"),
        totalNoxRegisteredGrams = BigDecimal("25"), averageFuelConsumptionLitresPer100Km = BigDecimal("8"),
        fuelConsumedLitres = BigDecimal("80"))) = StoredTripRow(UUID.randomUUID().toString(), "AB12345", createdAt = now.toString(), data = input)
    private fun registry(co2: List<String?> = listOf("120"), nox: String? = "25", fuel: String = "2",
        category: String = "M1G", body: String = "AA") = RegistryCheckResult(RegistryDataSource.LIVE, LookupOutcome.FOUND,
        fetchedAt = now.toString(), data = RegistryVehicleData("AB12345", "REGISTRERT", "Synthetic make", "Synthetic model",
            RegistryCode(category), RegistryCode(body), fuels = listOf(RegistryFuel(RegistryCode(fuel),
                co2.mapIndexed { i, value -> RegistryEmissionMeasurement(RegistryCode(if (i == 0) "WLTP" else "NEDC"), value?.toBigDecimal(), nox?.toBigDecimal()) }))))
    private fun evaluate(rows: List<StoredTripRow> = listOf(row()), approvals: List<StoredApproval> = listOf(approval("2025-01-01")),
        registry: RegistryCheckResult = registry()) = evaluateDeviationRules(approvals, rows, registry, today)

    @Test fun matchingNumbersCodesAndTextHaveNoFindings() { assertTrue(evaluate().isEmpty()) }
    @Test fun roundingIsNearestIntegerHalfUpAndPreservesStoredNumbers() {
        assertEquals(BigDecimal("9"), rounded(BigDecimal("8.5")))
        val a = row(); val input = a.data.copy(co2GramsPerKm = BigDecimal("120.49"), averageFuelConsumptionLitresPer100Km = BigDecimal("8.49"))
        assertTrue(evaluate(listOf(row(input)), registry = registry(listOf("120.4"))).isEmpty())
        val findings = evaluate(listOf(row(input)), registry = registry(listOf("120.5")))
        assertEquals(1, findings.count { it.code == VehicleDeviation.CO2_MISMATCH })
        assertEquals(BigDecimal("120.49"), input.co2GramsPerKm)
    }
    @Test fun allMethodsAreComparedEvenWhenOneMatchesAndRegistryDisagreementIsReported() {
        val results = evaluate(registry = registry(listOf("120", "140")))
        assertEquals(1, results.count { it.code == VehicleDeviation.CO2_MISMATCH })
        assertEquals(1, results.count { it.code == VehicleDeviation.REGISTRY_CO2_DISAGREEMENT })
        val mismatch = results.single { it.code == VehicleDeviation.CO2_MISMATCH }
        assertEquals(1, mismatch.measurementIndex); assertEquals(0, mismatch.fuelIndex)
        assertContains(mismatch.description, "NEDC"); assertContains(mismatch.description, "-20 kg")
    }
    @Test fun noxAndConsumptionUseUnitsAndExactDivisionBeforeRounding() {
        val results = evaluate(listOf(row(row().data.copy(averageFuelConsumptionLitresPer100Km = BigDecimal("9")))), registry = registry(nox = "26"))
        assertEquals(1, results.count { it.code == VehicleDeviation.CONSUMPTION_MISMATCH })
        assertEquals(1, results.count { it.code == VehicleDeviation.NOX_MISMATCH })
        val zero = evaluate(listOf(row(row().data.copy(totalKmNoxRegistered = BigDecimal.ZERO))))
        assertTrue(zero.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY && "NOx" in it.description })
        assertFalse(zero.any { it.code == VehicleDeviation.NOX_MISMATCH })
    }
    @Test fun zeroDistanceNeverDividesAndMissingNumbersAreNotCoercedToZero() {
        val results = evaluate(listOf(row(row().data.copy(totalTripKm = BigDecimal.ZERO))), registry = registry(listOf(null), nox = null))
        assertFalse(results.any { it.code == VehicleDeviation.CO2_MISMATCH })
        assertTrue(results.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY && "fuel consumption" in it.description })
        assertTrue(results.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY && "CO₂" in it.description })
    }
    @Test fun electricityNullsSkipEmissionAndLitreComparisons() {
        val input = syntheticTrip(fuelTechnology = FuelTechnology.ELECTRIC, totalTripKm = BigDecimal("1000"))
        val results = evaluate(listOf(row(input)), listOf(approval("2025-01-01", fuel = FuelTechnology.ELECTRIC)), registry(listOf(null), nox = null, fuel = "5"))
        assertTrue(results.isEmpty())
    }
    @Test fun adjacentAndCompatibleOverlappingApprovalsCoverWholePeriod() {
        val a = approval("2026-01-01", "2026-01-15"); val b = approval("2026-01-16", "2026-12-31")
        assertTrue(evaluate(approvals = listOf(a, b)).isEmpty())
        assertTrue(evaluate(approvals = listOf(a, approval("2026-01-10"))).isEmpty())
        assertTrue(evaluate(approvals = listOf(a, approval("2026-01-17"))).any { it.code == VehicleDeviation.APPROVAL_PERIOD_NOT_COVERED })
    }
    @Test fun conflictingOverlapsFlagEvenWhenOneApprovalCoversTheRow() {
        val results = evaluate(approvals = listOf(approval("2025-01-01"), approval("2026-01-10", fuel = FuelTechnology.ELECTRIC)))
        val conflict = results.single { it.code == VehicleDeviation.APPROVAL_CONFLICT }
        assertEquals(DeviationPriority.HIGH, conflict.priority); assertNotNull(conflict.approvalId); assertNotNull(conflict.relatedApprovalId)
        assertFalse(results.any { it.code == VehicleDeviation.APPROVAL_PERIOD_NOT_COVERED })
    }
    @Test fun revocationPreservesEarlierCoverageButExcludesItsEffectiveDay() {
        val revoked = approval("2026-01-01", revoked = "2026-02-01T10:00:00Z")
        assertTrue(evaluate(approvals = listOf(revoked)).isEmpty())
        assertTrue(evaluate(listOf(row(row().data.copy(periodEnd = "2026-02-01"))), listOf(revoked)).any { it.code == VehicleDeviation.APPROVAL_PERIOD_NOT_COVERED })
        assertEquals(ApprovalStatus.ACTIVE, approvalStatus(revoked, LocalDate.parse("2026-01-31")))
    }
    @Test fun fuelAndCategoryMismatchesAreHighAndTextDifferencesModerate() {
        val results = evaluate(registry = registry(fuel = "1", category = "N1", body = "AC"))
        for (code in listOf(VehicleDeviation.FUEL_MISMATCH, VehicleDeviation.CATEGORY_MISMATCH))
            assertTrue(results.any { it.code == code && it.priority == DeviationPriority.HIGH })
        assertTrue(results.any { it.code == VehicleDeviation.BODY_TYPE_MISMATCH && it.priority == DeviationPriority.MODERATE })
        assertFalse(results.any { it.code == VehicleDeviation.CO2_MISMATCH })
        assertTrue(evaluate(listOf(row(row().data.copy(make = "Another", model = "Other")))).any { it.code == VehicleDeviation.MODEL_MISMATCH })
    }
    @Test fun repeatedRowsRemainSeparateAndOverlapFindingsAreBounded() {
        val a = row(); val b = row()
        val results = evaluate(listOf(a, b), registry = registry(listOf("130")))
        assertEquals(2, results.count { it.code == VehicleDeviation.CO2_MISMATCH })
        assertEquals(1, results.count { it.code == VehicleDeviation.OVERLAPPING_STATISTICS })
        assertEquals(setOf(a.id, b.id), results.filter { it.code == VehicleDeviation.CO2_MISMATCH }.map { it.tripRowId }.toSet())
    }
    @Test fun manyOverlappingRowsDoNotProduceQuadraticPairOutput() {
        val electric = syntheticTrip(fuelTechnology = FuelTechnology.ELECTRIC)
        val rows = List(1000) { row(electric) }
        val findings = evaluate(rows, listOf(approval("2025-01-01", fuel = FuelTechnology.ELECTRIC)), registry(listOf(null), nox = null, fuel = "5"))
        assertEquals(999, findings.size)
        assertTrue(findings.all { it.code == VehicleDeviation.OVERLAPPING_STATISTICS })
    }
    @Test fun trailersDoNotRequireRegistryFuelAndUnknownFuelIsNotAConfirmedMismatch() {
        val trailer = syntheticTrip(fuelTechnology = FuelTechnology.NOT_APPLICABLE, vehicleCategory = VehicleCategory.O1)
        val reference = registry(listOf(null), nox = null, category = "O1").let { it.copy(data = it.data!!.copy(fuels = emptyList())) }
        assertTrue(evaluate(listOf(row(trailer)), listOf(approval("2025-01-01", fuel = FuelTechnology.NOT_APPLICABLE, category = VehicleCategory.O1)), reference).isEmpty())
        val unknown = evaluate(registry = registry(fuel = "999"))
        assertTrue(unknown.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY })
        assertFalse(unknown.any { it.code == VehicleDeviation.FUEL_MISMATCH })
    }
    @Test fun historicalApprovalAndFindingEvidenceSurvivesEditsAndRevocations() = runBlocking {
        val repo = VehicleRepository(Path.of("build", "test-data", "deviations-${UUID.randomUUID()}.db"))
        val old = repo.appendApprovals(AppendApprovalsRequest(approvals = listOf(syntheticApproval(startDate = "2025-01-01"))), now).approvals.single()
        repo.appendApprovals(AppendApprovalsRequest(approvals = listOf(syntheticApproval(startDate = "2026-01-10", fuelTechnology = FuelTechnology.ELECTRIC))), now)
        repo.appendTripRows(AppendTripRowsRequest(rows = listOf(row().data)), now)
        val service = VehicleCheckService(repo, VehicleRegistryClient { RegistryLookup.Found(registry(listOf("120", "140")).data!!) }, Duration.ofDays(14), Clock.fixed(now, ZoneId.of("Europe/Oslo")))
        val check = service.check(VehicleCheckRequest("AB12345"))
        repo.updateApproval(old.id, UpdateApprovalRequest(syntheticApproval(startDate = "2024-01-01", expiryDate = "2024-12-31"), old.updatedAt), now.plusSeconds(1))
        repo.revokeApproval(old.id, now.plusSeconds(2))
        assertEquals(check, repo.findCheck(check.id))
        assertEquals(2, check.approvals.size)
        val summary = repo.checkHistory("AB12345", 1, 10)!!.items.single()
        assertEquals(check.findings.size, summary.highPriorityCount + summary.moderatePriorityCount)
    }
}
