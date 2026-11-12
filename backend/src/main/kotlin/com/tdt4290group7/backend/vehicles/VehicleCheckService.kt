package com.tdt4290group7.backend.vehicles

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class VehicleCheckService(
    private val repository: VehicleStore,
    registry: VehicleRegistryClient?,
    cacheTtl: Duration = Duration.ofDays(14),
    private val clock: Clock = Clock.system(ZoneId.of("Europe/Oslo")),
    private val registryLookup: VehicleRegistryLookup = VehicleRegistryLookup(registry, cacheTtl, clock),
) {
    suspend fun check(request: VehicleCheckRequest): VehicleCheckResponse {
        val now = Instant.now(clock)
        repository.findOrCreateVehicle(request.registrationNumber, now)
        // Read the vehicle, agreement, statistics and cache in one SQLite snapshot.
        val state = requireNotNull(repository.vehicleDetails(request.registrationNumber))
        val vehicle = state.vehicle
        val agreement = state.agreement
        val tripRows = state.tripRows
        val cached = state.latestSnapshot
        val (registryResult, newSnapshot) = registryLookup.resolve(vehicle.registrationNumber, cached, request.forceRefresh, now)
        val findings = registryResult.deviations.map { code ->
            DeviationFinding(code, if (code == VehicleDeviation.UNKNOWN_REGISTRATION_STATUS) DeviationPriority.MODERATE else DeviationPriority.HIGH,
                DeviationOrigin.REGISTRY, "Registreringsstatus hos Statens vegvesen: ${registryResult.registrationStatus ?: "ikke tilgjengelig"}.")
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

}
