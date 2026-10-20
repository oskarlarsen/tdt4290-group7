package com.tdt4290group7.backend.vehicles

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class VehicleCheckService(
    private val repository: VehicleStore,
    private val registry: VehicleRegistryClient?,
    private val cacheTtl: Duration = Duration.ofDays(14),
    private val clock: Clock = Clock.system(ZoneId.of("Europe/Oslo")),
) {
    init {
        require(!cacheTtl.isNegative && !cacheTtl.isZero) { "cacheTtl must be positive" }
    }

    suspend fun check(request: VehicleCheckRequest): VehicleCheckResponse {
        val now = Instant.now(clock)
        repository.findOrCreateVehicle(request.registrationNumber, now)
        // Read the vehicle, agreement, statistics and cache in one SQLite snapshot.
        val state = requireNotNull(repository.vehicleDetails(request.registrationNumber))
        val vehicle = state.vehicle
        val agreement = state.agreement
        val tripRows = state.tripRows
        val cached = state.latestSnapshot
        val (registryResult, newSnapshot) = registryResult(vehicle, cached, request.forceRefresh, now)
        val findings = registryResult.deviations.map { code ->
            DeviationFinding(code, if (code == VehicleDeviation.UNKNOWN_REGISTRATION_STATUS) DeviationPriority.MODERATE else DeviationPriority.HIGH,
                DeviationOrigin.REGISTRY, "Statens Vegvesen registration status: ${registryResult.registrationStatus ?: "not available"}.")
        } + evaluateDeviationRules(agreement, vehicle, tripRows, registryResult, LocalDate.now(clock))
        val deviations = findings.map { it.code }.distinct()
        val response = VehicleCheckResponse(
            id = UUID.randomUUID().toString(),
            checkedAt = now.storageTimestamp(),
            vehicle = vehicle,
            agreement = agreement,
            tripRows = tripRows,
            registry = registryResult.copy(deviations = findings.filter { it.origin == DeviationOrigin.REGISTRY }.map { it.code }.distinct()),
            deviations = deviations,
            findings = findings,
        )
        repository.saveCheck(response, newSnapshot)
        return response
    }

    private suspend fun registryResult(
        vehicle: Vehicle,
        cached: RegistrySnapshot?,
        forceRefresh: Boolean,
        now: Instant,
    ): Pair<RegistryCheckResult, RegistrySnapshot?> {
        if (!forceRefresh && cached != null && isFresh(cached, now)) {
            return resultFromSnapshot(cached, RegistryDataSource.CACHE) to null
        }

        val lookup = registry?.lookup(vehicle.registrationNumber)
            ?: RegistryLookup.Failed(LookupOutcome.NOT_CONFIGURED)
        return when (lookup) {
            is RegistryLookup.Found -> {
                require(lookup.data.registrationNumber == vehicle.registrationNumber) { "Registry vehicle mismatch" }
                val snapshot = RegistrySnapshot(
                    id = UUID.randomUUID().toString(),
                    registrationNumber = vehicle.registrationNumber,
                    fetchedAt = now.storageTimestamp(),
                    source = "STATENS_VEGVESEN_ENKELTOPPSLAG",
                    data = lookup.data,
                )
                resultFromSnapshot(snapshot, RegistryDataSource.LIVE) to snapshot
            }
            is RegistryLookup.Failed -> if (cached != null) {
                resultFromSnapshot(cached, RegistryDataSource.STALE_CACHE, lookup.outcome) to null
            } else {
                RegistryCheckResult(
                    dataSource = RegistryDataSource.UNAVAILABLE,
                    lookupOutcome = lookup.outcome,
                ) to null
            }
        }
    }

    private fun isFresh(snapshot: RegistrySnapshot, now: Instant): Boolean {
        val age = Duration.between(Instant.parse(snapshot.fetchedAt), now)
        return !age.isNegative && age <= cacheTtl
    }

    private fun resultFromSnapshot(
        snapshot: RegistrySnapshot,
        source: RegistryDataSource,
        refreshFailure: LookupOutcome? = null,
    ) = RegistryCheckResult(
        dataSource = source,
        lookupOutcome = LookupOutcome.FOUND,
        fetchedAt = snapshot.fetchedAt,
        registrationStatus = snapshot.data.registrationStatus,
        data = snapshot.data,
        deviations = deviationsForRegistrationStatus(snapshot.data.registrationStatus),
        snapshotId = snapshot.id,
        refreshFailure = refreshFailure,
    )

    private fun deviationsForRegistrationStatus(status: String?): List<VehicleDeviation> =
        when (status?.uppercase()) {
            "REGISTRERT" -> emptyList()
            "AVREGISTRERT" -> listOf(VehicleDeviation.DEREGISTERED)
            "UTFORT" -> listOf(VehicleDeviation.EXPORTED)
            "VRAKET" -> listOf(VehicleDeviation.SCRAPPED)
            "UREGISTRERT" -> listOf(VehicleDeviation.UNREGISTERED)
            else -> listOf(VehicleDeviation.UNKNOWN_REGISTRATION_STATUS)
        }
}
