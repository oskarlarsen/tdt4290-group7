package com.tdt4290group7.backend.vehicles

import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

class VehicleCheckService(
    private val repository: VehicleStore,
    private val registry: VehicleRegistryClient,
) {
    suspend fun checkImport(importId: String): VehicleCheckRunResponse? {
        if (repository.findImport(importId) == null) return null
        val startedAt = Instant.now().toString()
        val limiter = Semaphore(8)
        val stopOutcome = AtomicReference<LookupOutcome?>(null)
        val checked = coroutineScope { repository.rowsForImport(importId)
            .map { it.normalizedRegistrationNumber }
            .distinct()
            .map { plate -> async { limiter.withPermit {
                val checkedAt = Instant.now().toString()
                val lookup = stopOutcome.get()?.let(RegistryLookup::Failed) ?: registry.lookup(plate)
                if (lookup is RegistryLookup.Failed &&
                    lookup.outcome in setOf(LookupOutcome.ACCESS_DENIED, LookupOutcome.QUOTA_EXHAUSTED)
                ) {
                    stopOutcome.compareAndSet(null, lookup.outcome)
                }
                when (lookup) {
                    is RegistryLookup.Found -> {
                        val status = lookup.data.registrationStatus()
                        val snapshot = RegistrySnapshot(
                            id = UUID.randomUUID().toString(),
                            normalizedRegistrationNumber = plate,
                            fetchedAt = checkedAt,
                            source = "STATENS_VEGVESEN_ENKELTOPPSLAG",
                            registrationStatus = status,
                            data = lookup.data,
                        )
                        VehicleCheckResult(
                            normalizedRegistrationNumber = plate,
                            checkedAt = checkedAt,
                            lookupOutcome = LookupOutcome.FOUND,
                            registrationStatus = status,
                            deviations = deviationsForStatus(status),
                            registrySnapshotId = snapshot.id,
                        ) to snapshot
                    }
                    is RegistryLookup.Failed -> VehicleCheckResult(
                        normalizedRegistrationNumber = plate,
                        checkedAt = checkedAt,
                        lookupOutcome = lookup.outcome,
                    ) to null
                }
            } } }
            .awaitAll() }
        val results = checked.map { it.first }
        val snapshots = checked.mapNotNull { it.second }
        val run = VehicleCheckRunResponse(
            id = UUID.randomUUID().toString(),
            importId = importId,
            startedAt = startedAt,
            completedAt = Instant.now().toString(),
            checkedCount = results.size,
            deviationCount = results.count { it.deviations.isNotEmpty() },
            unavailableCount = results.count { it.lookupOutcome != LookupOutcome.FOUND },
            results = results,
        )
        repository.saveCheckRun(run, snapshots)
        return run
    }

    private fun deviationsForStatus(status: String?): List<VehicleDeviation> = when (status) {
        "REGISTRERT" -> emptyList()
        "AVREGISTRERT" -> listOf(VehicleDeviation.DEREGISTERED)
        "UTFORT" -> listOf(VehicleDeviation.EXPORTED)
        "VRAKET" -> listOf(VehicleDeviation.SCRAPPED)
        "UREGISTRERT" -> listOf(VehicleDeviation.UNREGISTERED)
        else -> listOf(VehicleDeviation.UNKNOWN_REGISTRATION_STATUS)
    }
}
