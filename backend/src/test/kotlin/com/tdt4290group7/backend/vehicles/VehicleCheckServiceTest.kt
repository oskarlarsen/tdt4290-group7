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
            assertTrue(VehicleDeviation.NOT_ON_AGREEMENT_LIST in result.deviations)
            assertTrue(VehicleDeviation.DEREGISTERED in result.deviations)
            assertTrue(VehicleDeviation.UNABLE_TO_VERIFY in result.deviations)
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
    fun registrationDeviationsSurviveHistoricalRetrieval() = runBlocking {
        val expected = mapOf("AVREGISTRERT" to VehicleDeviation.DEREGISTERED, "UTFORT" to VehicleDeviation.EXPORTED,
            "VRAKET" to VehicleDeviation.SCRAPPED, "UREGISTRERT" to VehicleDeviation.UNREGISTERED,
            "NEW_UNKNOWN_CODE" to VehicleDeviation.UNKNOWN_REGISTRATION_STATUS)
        expected.forEach { (status, deviation) ->
            val repository = repository()
            val result = service(repository, VehicleRegistryClient { RegistryLookup.Found(registryData(status)) },
                "2026-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
            assertTrue(deviation in result.registry.deviations)
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
