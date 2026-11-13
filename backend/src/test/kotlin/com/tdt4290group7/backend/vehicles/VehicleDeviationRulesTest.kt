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
    private val agreement = AgreementEvidence(FleetAgreement("agreement", "supplier", "2025-01-01", "2027-12-31", 10, "", now.toString()),
        FleetSupplier("supplier", "Synthetic", "123456789"))
    private val vehicle = Vehicle("AB12345", now.toString(), "agreement", listed = true)
    private fun row(input: TripRowInput = syntheticTrip("AB12345", "2026-01-01", "2026-01-31", co2Registered = true,
        co2GramsPerKm = BigDecimal("120"), totalTripKm = BigDecimal("1000"), totalKmNoxRegistered = BigDecimal("1000"),
        totalNoxRegisteredGrams = BigDecimal("25"), averageFuelConsumptionLitresPer100Km = BigDecimal("8"),
        fuelConsumedLitres = BigDecimal("80"))) = StoredTripRow(UUID.randomUUID().toString(), "AB12345", createdAt = now.toString(), data = input)
    private fun registry(co2: List<String?> = listOf("120"), nox: String? = "25", fuel: String = "2",
        category: String = "M1G", body: String = "AA") = RegistryCheckResult(RegistryDataSource.LIVE, LookupOutcome.FOUND,
        fetchedAt = now.toString(), data = RegistryVehicleData("AB12345", "REGISTRERT", "Synthetic make", "Synthetic model",
            RegistryCode(category), RegistryCode(body), fuels = listOf(RegistryFuel(RegistryCode(fuel),
                co2.mapIndexed { i, value -> RegistryEmissionMeasurement(RegistryCode(if (i == 0) "WLTP" else "NEDC"), value?.toBigDecimal(), nox?.toBigDecimal()) }))))
    private fun evaluate(rows: List<StoredTripRow> = listOf(row()), registry: RegistryCheckResult = registry()) =
        evaluateDeviationRules(agreement, vehicle, rows, registry, today)

    @Test fun matchingNumbersCodesAndTextHaveNoFindings() { assertTrue(evaluate().isEmpty()) }
    @Test fun agreementDatesDefineSupplierPermissionWithoutIndividualVehicleApprovalDates() {
        val future = agreement.copy(agreement = agreement.agreement.copy(startDate = "2026-06-02"))
        val findings = evaluateDeviationRules(future, vehicle, listOf(row()), registry(), today)
        assertTrue(findings.any { it.code == VehicleDeviation.AGREEMENT_NOT_STARTED })
        assertTrue(findings.any { it.code == VehicleDeviation.AGREEMENT_PERIOD_NOT_COVERED })
        val endingToday = agreement.copy(agreement = agreement.agreement.copy(endDate = today.toString()))
        assertFalse(evaluateDeviationRules(endingToday, vehicle, emptyList(), registry(), today).any { it.code == VehicleDeviation.AGREEMENT_EXPIRED })
        assertTrue(evaluateDeviationRules(endingToday, vehicle, emptyList(), registry(), today.plusDays(1)).any { it.code == VehicleDeviation.AGREEMENT_EXPIRED })
    }
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
        assertTrue(results.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY && "drivstofforbruk" in it.description })
        assertTrue(results.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY && "CO₂" in it.description })
    }
    @Test fun electricityNullsSkipEmissionAndLitreComparisons() {
        val input = syntheticTrip(fuelTechnology = FuelTechnology.ELECTRIC, totalTripKm = BigDecimal("1000"))
        val results = evaluate(listOf(row(input)), registry(listOf(null), nox = null, fuel = "5"))
        assertTrue(results.isEmpty())
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
        val findings = evaluate(rows, registry(listOf(null), nox = null, fuel = "5"))
        assertEquals(999, findings.size)
        assertTrue(findings.all { it.code == VehicleDeviation.OVERLAPPING_STATISTICS })
    }
    @Test fun trailersDoNotRequireRegistryFuelAndUnknownFuelIsNotAConfirmedMismatch() {
        val trailer = syntheticTrip(fuelTechnology = FuelTechnology.NOT_APPLICABLE, vehicleCategory = VehicleCategory.O1)
        val reference = registry(listOf(null), nox = null, category = "O1").let { it.copy(data = it.data!!.copy(fuels = emptyList())) }
        assertTrue(evaluate(listOf(row(trailer)), reference).isEmpty())
        val unknown = evaluate(registry = registry(fuel = "999"))
        assertTrue(unknown.any { it.code == VehicleDeviation.UNABLE_TO_VERIFY })
        assertFalse(unknown.any { it.code == VehicleDeviation.FUEL_MISMATCH })
    }

}
