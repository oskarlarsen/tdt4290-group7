package com.tdt4290group7.backend.vehicles

import java.nio.file.Path
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull

class VehicleCheckServiceTest {
    @Test
    fun reusesFreshSnapshotAndForceRefreshBypassesCache() = runBlocking {
        val repository = repository()
        var calls = 0
        val registry = VehicleRegistryClient {
            calls++
            RegistryLookup.Found(registryData("REGISTRERT", calls))
        }

        val first = service(repository, registry, "2026-01-01T00:00:00Z")
            .check(VehicleCheckRequest("AB12345"))
        assertEquals(RegistryDataSource.LIVE, first.registry.dataSource)
        assertEquals(1, calls)

        val cached = service(repository, registry, "2026-01-10T00:00:00Z")
            .check(VehicleCheckRequest("AB12345"))
        assertEquals(RegistryDataSource.CACHE, cached.registry.dataSource)
        assertEquals(first.registry.snapshotId, cached.registry.snapshotId)
        assertEquals(1, calls)

        val forced = service(repository, registry, "2026-01-10T00:00:00Z")
            .check(VehicleCheckRequest("AB12345", forceRefresh = true))
        assertEquals(RegistryDataSource.LIVE, forced.registry.dataSource)
        assertEquals(2, calls)
        assertEquals(RegistryValue.NumberValue("2"), forced.registry.data?.field("lookupNumber"))
    }

    @Test
    fun failedRefreshReturnsExplicitStaleCache() = runBlocking {
        val repository = repository()
        val success = VehicleRegistryClient { RegistryLookup.Found(registryData("AVREGISTRERT", 1)) }
        service(repository, success, "2026-01-01T00:00:00Z")
            .check(VehicleCheckRequest("AB12345"))

        val unavailable = VehicleRegistryClient { RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE) }
        val result = service(repository, unavailable, "2026-01-20T00:00:00Z")
            .check(VehicleCheckRequest("AB12345"))

        assertEquals(RegistryDataSource.STALE_CACHE, result.registry.dataSource)
        assertEquals(LookupOutcome.FOUND, result.registry.lookupOutcome)
        assertEquals(LookupOutcome.TEMPORARILY_UNAVAILABLE, result.registry.refreshFailure)
        assertEquals(listOf(VehicleDeviation.NOT_ON_APPROVED_LIST, VehicleDeviation.DEREGISTERED), result.deviations)
    }

    @Test
    fun approvalUsesTodayAndMissingDatesMeanImmediateAndIndefinite() = runBlocking {
        val repository = repository()
        val now = Instant.parse("2026-09-23T12:00:00Z")
        repository.upsertApprovals(
            UpsertApprovalsRequest(approvals = listOf(ApprovalInput("AB12345"))),
            now,
        )
        val active = service(repository, null, now.toString()).check(VehicleCheckRequest("AB12345"))
        assertEquals(ApprovalStatus.ACTIVE, active.approvalStatus)

        repository.upsertApprovals(
            UpsertApprovalsRequest(approvals = listOf(ApprovalInput("CD54321", startDate = "2026-09-24"))),
            now,
        )
        val future = service(repository, null, now.toString()).check(VehicleCheckRequest("CD54321"))
        assertEquals(ApprovalStatus.NOT_YET_ACTIVE, future.approvalStatus)
        assertEquals(RegistryDataSource.UNAVAILABLE, future.registry.dataSource)
        assertEquals(LookupOutcome.NOT_CONFIGURED, future.registry.lookupOutcome)
    }

    @Test
    fun completeRegistryTreeSurvivesSQLiteCache() = runBlocking {
        val repository = repository()
        val registry = VehicleRegistryClient {
            RegistryLookup.Found(
                Json.parseToJsonElement(
                    """{"kjoretoydataListe":[{"registrering":{"registreringsstatus":{"kodeVerdi":"REGISTRERT"}},
                        "miljodata":{"co2":123.50,"other":null,"flags":[true,"x"]}}]}""",
                ).toRegistryValue(),
            )
        }
        service(repository, registry, "2026-01-01T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        val cached = service(repository, null, "2026-01-02T00:00:00Z").check(VehicleCheckRequest("AB12345"))
        val vehicle = assertIs<RegistryValue.ArrayValue>(cached.registry.data?.field("kjoretoydataListe")).items.single()
        val environment = vehicle.field("miljodata")
        assertEquals(RegistryValue.NumberValue("123.50"), environment?.field("co2"))
        assertEquals(RegistryValue.NullValue, environment?.field("other"))
        assertNotNull(cached.registry.snapshotId)
        Unit
    }

    private fun repository() = VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db"))

    private fun service(
        repository: VehicleStore,
        registry: VehicleRegistryClient?,
        instant: String,
    ) = VehicleCheckService(
        repository,
        registry,
        Duration.ofDays(14),
        Clock.fixed(Instant.parse(instant), ZoneOffset.UTC),
    )

    private fun registryData(status: String, lookupNumber: Int) = Json.parseToJsonElement(
        """{"lookupNumber":$lookupNumber,"kjoretoydataListe":[{
            "registrering":{"registreringsstatus":{"kodeVerdi":"$status"}}
        }]}""",
    ).toRegistryValue()
}
