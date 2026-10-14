package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class VehicleCheckServiceTest {
    @Test
    fun reusesFreshSnapshotAndForceRefreshBypassesCacheIncludingIdenticalFetchTimes() = runBlocking {
        val repository = repository()
        var calls = 0
        val registry = VehicleRegistryClient { RegistryLookup.Found(registryData(model = "lookup-" + ++calls)) }
        val first = service(repository, registry, "2026-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        assertEquals(RegistryDataSource.LIVE, first.registry.dataSource)
        val cached = service(repository, registry, "2026-01-10T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        assertEquals(RegistryDataSource.CACHE, cached.registry.dataSource)
        assertEquals(first.registry.snapshotId, cached.registry.snapshotId)
        assertEquals(1, calls)
        val forced = service(repository, registry, "2026-01-10T00:00:00Z").check(VehicleCheckRequest("AB12345", true))
        val forcedAgain = service(repository, registry, "2026-01-10T00:00:00Z").check(VehicleCheckRequest("AB12345", true))
        assertNotEquals(forced.registry.snapshotId, forcedAgain.registry.snapshotId)
        assertEquals("lookup-3", forcedAgain.registry.data?.model)
        val next = service(repository, null, "2026-01-10T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        assertEquals(forcedAgain.registry.snapshotId, next.registry.snapshotId)
        assertEquals(3, calls)
    }

    @Test
    fun failedRefreshReturnsExplicitStaleCacheForEveryFailureOutcome() = runBlocking {
        val repository = repository()
        val success = VehicleRegistryClient { RegistryLookup.Found(registryData("AVREGISTRERT")) }
        val first = service(repository, success, "2026-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        LookupOutcome.entries.filter { it != LookupOutcome.FOUND }.forEach { failure ->
            val unavailable = VehicleRegistryClient { RegistryLookup.Failed(failure) }
            val result = service(repository, unavailable, "2026-01-20T00:00:00Z").check(VehicleCheckRequest("AB12345"))
            assertEquals(RegistryDataSource.STALE_CACHE, result.registry.dataSource)
            assertEquals(LookupOutcome.FOUND, result.registry.lookupOutcome)
            assertEquals(failure, result.registry.refreshFailure)
            assertEquals(first.registry.snapshotId, result.registry.snapshotId)
            assertEquals(listOf(VehicleDeviation.NOT_ON_APPROVED_LIST, VehicleDeviation.DEREGISTERED), result.deviations)
            assertEquals(result, repository.findCheck(result.id))
        }
    }

    @Test
    fun cacheBoundaryAndConfigurableTtlRemainSupported() = runBlocking {
        val repository = repository()
        var calls = 0
        val registry = VehicleRegistryClient { calls++; RegistryLookup.Found(registryData()) }
        service(repository, registry, "2026-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        assertEquals(RegistryDataSource.CACHE, service(repository, registry, "2026-01-15T00:00:00Z")
            .check(VehicleCheckRequest("AB12345")).registry.dataSource)
        assertEquals(RegistryDataSource.LIVE, service(repository, registry, "2026-01-15T00:00:00.000000001Z")
            .check(VehicleCheckRequest("AB12345")).registry.dataSource)
        assertEquals(2, calls)
        assertEquals(RegistryDataSource.LIVE, service(repository, registry, "2026-01-17T00:00:00Z", Duration.ofDays(1))
            .check(VehicleCheckRequest("AB12345")).registry.dataSource)
        assertEquals(3, calls)
    }

    @Test
    fun approvalUsesTodayInOsloNotTheStatisticsPeriod() = runBlocking {
        val repository = repository()
        val now = Instant.parse("2026-09-23T22:30:00Z") // Already September 24 in Oslo.
        repository.upsertApprovals(UpsertApprovalsRequest(approvals = listOf(
            syntheticApproval("AB12345"), syntheticApproval("CD54321", startDate = "2026-09-25"),
            syntheticApproval("EF12345", expiryDate = "2026-09-24"),
        )), now)
        assertEquals(ApprovalStatus.ACTIVE, service(repository, null, now.toString()).check(VehicleCheckRequest("AB12345")).approvalStatus)
        val future = service(repository, null, now.toString()).check(VehicleCheckRequest("CD54321"))
        assertEquals(ApprovalStatus.NOT_YET_ACTIVE, future.approvalStatus)
        assertEquals(RegistryDataSource.UNAVAILABLE, future.registry.dataSource)
        assertEquals(LookupOutcome.NOT_CONFIGURED, future.registry.lookupOutcome)
        assertEquals(ApprovalStatus.ACTIVE, service(repository, null, now.toString()).check(VehicleCheckRequest("EF12345")).approvalStatus)
        assertEquals(ApprovalStatus.EXPIRED, service(repository, null, "2026-09-25T12:00:00Z")
            .check(VehicleCheckRequest("EF12345")).approvalStatus)
    }

    @Test
    fun historyPreservesApprovalStatisticsSelectedSnapshotAndEstimateIndefinitely() = runBlocking {
        val repository = repository()
        val now = Instant.parse("2026-01-01T00:00:00Z")
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(
            syntheticTrip("AB 12345", "2025-12-01", "2025-12-31", fuelTechnology = FuelTechnology.DIESEL,
                co2GramsPerKm = BigDecimal("123.456"), totalTripKm = BigDecimal("1000"),
                totalKmNoxRegistered = BigDecimal("1000"), totalNoxRegisteredGrams = BigDecimal("25.67")),
        )), now)
        repository.upsertApprovals(UpsertApprovalsRequest("original", listOf(
            syntheticApproval("AB12345", FuelTechnology.DIESEL, "2025-01-01", "2026-12-31", VehicleCategory.M1),
        )), now)
        val first = service(repository, VehicleRegistryClient { RegistryLookup.Found(registryData()) }, now.toString())
            .check(VehicleCheckRequest("ab-12345"))
        assertEquals(BigDecimal("123.456"), first.tripRows.single().estimatedCo2Kg)
        assertTrue(first.deviations.isEmpty()) // No environmental comparisons, even though observations differ.
        repository.upsertApprovals(UpsertApprovalsRequest(approvals = listOf(
            syntheticApproval("AB12345", FuelTechnology.ELECTRIC),
        )), now.plusSeconds(1))
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(
            syntheticTrip("AB12345", "2026-01-01", "2026-01-31"),
        )), now.plusSeconds(2))
        repository.revokeApproval("AB12345", now.plusSeconds(3))
        val later = service(repository, null, "2028-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        assertEquals(ApprovalStatus.REVOKED, later.approvalStatus)
        assertEquals(2, later.tripRows.size)
        assertEquals(RegistryDataSource.STALE_CACHE, later.registry.dataSource)
        val saved = assertNotNull(repository.findCheck(first.id))
        assertEquals(Json.encodeToString(first), Json.encodeToString(saved))
        assertEquals(FuelTechnology.DIESEL, saved.approval?.data?.fuelTechnology)
        assertEquals(1, saved.tripRows.size)
        assertEquals(RegistryDataSource.LIVE, saved.registry.dataSource)
        assertEquals(first.registry.snapshotId, later.registry.snapshotId)
        assertNull(saved.registry.refreshFailure)
    }

    @Test
    fun registrationDeviationsSurviveHistoricalRetrieval() = runBlocking {
        val expected = mapOf("AVREGISTRERT" to VehicleDeviation.DEREGISTERED, "UTFORT" to VehicleDeviation.EXPORTED,
            "VRAKET" to VehicleDeviation.SCRAPPED, "UREGISTRERT" to VehicleDeviation.UNREGISTERED,
            "NEW_UNKNOWN_CODE" to VehicleDeviation.UNKNOWN_REGISTRATION_STATUS)
        expected.forEach { (status, deviation) ->
            val repository = repository()
            val result = service(repository, VehicleRegistryClient { RegistryLookup.Found(registryData(status)) },
                "2026-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
            assertEquals(listOf(deviation), result.registry.deviations)
            assertEquals(result, repository.findCheck(result.id))
        }
    }

    private fun repository() = VehicleRepository(Path.of("build", "test-data", UUID.randomUUID().toString() + ".db"))
    private fun service(repository: VehicleStore, registry: VehicleRegistryClient?, instant: String, ttl: Duration = Duration.ofDays(14)) =
        VehicleCheckService(repository, registry, ttl, Clock.fixed(Instant.parse(instant), ZoneId.of("Europe/Oslo")))

    private fun registryData(status: String = "REGISTRERT", model: String = "Synthetic") = RegistryVehicleData(
        registrationNumber = "AB12345", registrationStatus = status, make = "Test Make", model = model,
        vehicleCategory = RegistryCode("M1"), bodyType = RegistryCode("AA", "Sedan"),
        euroClass = RegistryCode("6", "Euro 6"),
        fuels = listOf(RegistryFuel(RegistryCode("2", "Diesel"), listOf(
            RegistryEmissionMeasurement(RegistryCode("WLTP"), BigDecimal("100.123456"), BigDecimal("12.34567")),
            RegistryEmissionMeasurement(RegistryCode("NEDC"), BigDecimal("99"), null),
        ))),
    )
}
