package com.tdt4290group7.backend.vehicles

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID

class RegistryUnavailableException : RuntimeException("Statens vegvesen is unavailable. The vehicle was not added. Try again.")

/** Shared lookup boundary. Adding requires a live response; checks may use historical cache. */
class VehicleRegistryLookup(
    private val registry: VehicleRegistryClient?,
    private val cacheTtl: Duration = Duration.ofDays(14),
    private val clock: Clock = Clock.system(ZoneId.of("Europe/Oslo")),
) {
    init { require(!cacheTtl.isNegative && !cacheTtl.isZero) { "cacheTtl must be positive" } }

    suspend fun verifyEntry(input: VehicleEntryInput): RegistrySnapshot? {
        val plate = input.validatedRegistrationNumber() ?: return null
        val (result, snapshot) = resolve(plate, null, true, Instant.now(clock))
        if (result.lookupOutcome == LookupOutcome.NOT_FOUND)
            throw IllegalArgumentException("Registration number was not found in Statens vegvesen. Check the number and try again.")
        if (snapshot == null) throw RegistryUnavailableException()
        return snapshot
    }

    suspend fun resolve(
        registrationNumber: String,
        cached: RegistrySnapshot?,
        forceRefresh: Boolean,
        now: Instant,
    ): Pair<RegistryCheckResult, RegistrySnapshot?> {
        if (!forceRefresh && cached != null && isFresh(cached, now)) {
            return resultFromSnapshot(cached, RegistryDataSource.CACHE) to null
        }

        val lookup = registry?.lookup(registrationNumber)
            ?: RegistryLookup.Failed(LookupOutcome.NOT_CONFIGURED)
        return when (lookup) {
            is RegistryLookup.Found -> {
                require(lookup.data.registrationNumber == registrationNumber) { "Registry vehicle mismatch" }
                val snapshot = RegistrySnapshot(
                    id = UUID.randomUUID().toString(),
                    registrationNumber = registrationNumber,
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
