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
        val vehicle = repository.findOrCreateVehicle(request.registrationNumber, now)
        val approval = repository.approvalForVehicle(vehicle.registrationNumber)
        val approvalStatus = approvalStatus(approval, LocalDate.now(clock))
        val tripRows = repository.tripRowsForVehicle(vehicle.registrationNumber)
        val cached = repository.latestSnapshot(vehicle.registrationNumber)
        val (registryResult, newSnapshot) = registryResult(vehicle, cached, request.forceRefresh, now)
        val deviations = (approvalDeviations(approvalStatus) + registryResult.deviations).distinct()
        val response = VehicleCheckResponse(
            id = UUID.randomUUID().toString(),
            checkedAt = now.storageTimestamp(),
            vehicle = vehicle,
            approvalStatus = approvalStatus,
            approval = approval,
            tripRows = tripRows,
            registry = registryResult,
            deviations = deviations,
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

    private fun approvalDeviations(status: ApprovalStatus): List<VehicleDeviation> = when (status) {
        ApprovalStatus.ACTIVE -> emptyList()
        ApprovalStatus.NOT_APPROVED -> listOf(VehicleDeviation.NOT_ON_APPROVED_LIST)
        ApprovalStatus.NOT_YET_ACTIVE -> listOf(VehicleDeviation.APPROVAL_NOT_YET_ACTIVE)
        ApprovalStatus.EXPIRED -> listOf(VehicleDeviation.APPROVAL_EXPIRED)
        ApprovalStatus.REVOKED -> listOf(VehicleDeviation.APPROVAL_REVOKED)
    }

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

/** Shared by current read views and check evaluation; expiry today is still active. */
internal fun approvalStatus(approval: StoredApproval?, today: LocalDate): ApprovalStatus {
    if (approval == null) return ApprovalStatus.NOT_APPROVED
    if (approval.revokedAt != null) return ApprovalStatus.REVOKED
    val start = approval.data.startDate?.let(LocalDate::parse)
    val expiry = approval.data.expiryDate?.let(LocalDate::parse)
    return when {
        start != null && start.isAfter(today) -> ApprovalStatus.NOT_YET_ACTIVE
        expiry != null && expiry.isBefore(today) -> ApprovalStatus.EXPIRED
        else -> ApprovalStatus.ACTIVE
    }
}
