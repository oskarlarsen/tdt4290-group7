@file:kotlinx.serialization.UseSerializers(DecimalSerializer::class)
@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import kotlinx.serialization.Serializable

@Serializable
data class Vehicle(
    val registrationNumber: String,
    /** Reserved for the future supplier model. */
    val supplierId: String? = null,
    val createdAt: String,
)

/** Supplier observations for a period, not one individual journey or unique vehicle. */
@Serializable
data class TripRowInput(
    val registrationNumber: String,
    val periodStart: String,
    val periodEnd: String,
    /** Supplier's reported technology; not the approval or SVV observation. */
    val fuelTechnology: FuelTechnology,
    val make: String,
    val bodyType: BodyType,
    val model: String,
    val co2Registered: Boolean,
    val co2GramsPerKm: BigDecimal,
    val medianCo2: BigDecimal,
    val totalTripKm: BigDecimal,
    val totalKmCo2Registered: BigDecimal,
    val totalKmCo2NotRegistered: BigDecimal,
    val kmFuelNotRegistered: BigDecimal,
    val totalKmFuelRegistered: BigDecimal,
    val totalKmNoxRegistered: BigDecimal,
    val totalNoxRegisteredGrams: BigDecimal,
    val tripCount: Int,
    val vehicleCategory: VehicleCategory,
    val assignmentNumber: String? = null,
    val averageConsumptionLitresPerKm: BigDecimal? = null,
    val fuelConsumedLitres: BigDecimal? = null,
    val comment: String? = null,
)

fun TripRowInput.estimateCo2Kg(): BigDecimal =
    totalTripKm.multiply(co2GramsPerKm).movePointLeft(3).stripTrailingZeros()

@Serializable
data class AppendTripRowsRequest(val sourceName: String? = null, val rows: List<TripRowInput>)

@Serializable
data class StoredTripRow(
    val id: String,
    val registrationNumber: String,
    val sourceName: String? = null,
    val createdAt: String,
    val data: TripRowInput,
    /** Read-only supplier-based estimate from required explicit observations. */
    @kotlinx.serialization.EncodeDefault
    val estimatedCo2Kg: BigDecimal = data.estimateCo2Kg(),
)

@Serializable
data class AppendTripRowsResponse(
    val createdAt: String,
    val rowCount: Int,
    val distinctVehicleCount: Int,
    val rows: List<StoredTripRow>,
)

@Serializable
data class ApprovalInput(
    val registrationNumber: String,
    /** Official fuel code, separate from supplier/SVV observations. */
    val fuelTechnology: FuelTechnology,
    val vehicleCategory: VehicleCategory,
    val usedThroughoutPeriod: Boolean? = null,
    /** Missing means effective immediately. */
    val startDate: String? = null,
    /** Missing means approved indefinitely, until manually revoked. */
    val expiryDate: String? = null,
)

@Serializable
data class UpsertApprovalsRequest(val sourceName: String? = null, val approvals: List<ApprovalInput>)

@Serializable
data class StoredApproval(
    val id: String,
    val registrationNumber: String,
    val sourceName: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val revokedAt: String? = null,
    val data: ApprovalInput,
)

@Serializable
data class UpsertApprovalsResponse(
    val updatedAt: String,
    val approvalCount: Int,
    val approvals: List<StoredApproval>,
)

@Serializable
enum class ApprovalStatus { ACTIVE, NOT_YET_ACTIVE, EXPIRED, REVOKED, NOT_APPROVED }

@Serializable
data class VehicleCheckRequest(val registrationNumber: String, val forceRefresh: Boolean = false)

@Serializable
data class RegistryCode(val code: String, val name: String? = null)

@Serializable
data class RegistryEmissionMeasurement(
    val measurementMethod: RegistryCode? = null,
    val co2GramsPerKm: BigDecimal? = null,
    val noxMgPerKm: BigDecimal? = null,
)

@Serializable
data class RegistryFuel(
    /** SVV's code/name, not a supplier observation or approval requirement. */
    val fuelTechnology: RegistryCode? = null,
    val measurements: List<RegistryEmissionMeasurement> = emptyList(),
)

/** Allowlisted projection only: never a raw SVV response or arbitrary-field map. */
@Serializable
data class RegistryVehicleData(
    val registrationNumber: String,
    val registrationStatus: String? = null,
    val make: String? = null,
    val model: String? = null,
    val vehicleCategory: RegistryCode? = null,
    val bodyType: RegistryCode? = null,
    val euroClass: RegistryCode? = null,
    val fuels: List<RegistryFuel> = emptyList(),
)

@Serializable
data class RegistrySnapshot(
    val id: String,
    val registrationNumber: String,
    val fetchedAt: String,
    val source: String,
    val data: RegistryVehicleData,
)

@Serializable
enum class LookupOutcome {
    FOUND, NOT_FOUND, INVALID_RESPONSE, ACCESS_DENIED, QUOTA_EXHAUSTED,
    TEMPORARILY_UNAVAILABLE, NOT_CONFIGURED,
}

@Serializable
enum class VehicleDeviation {
    NOT_ON_APPROVED_LIST, APPROVAL_NOT_YET_ACTIVE, APPROVAL_EXPIRED, APPROVAL_REVOKED,
    DEREGISTERED, EXPORTED, SCRAPPED, UNREGISTERED, UNKNOWN_REGISTRATION_STATUS,
}

@Serializable
enum class UsageProhibitionState { ACTIVE, FUTURE, NONE, UNKNOWN }

@Serializable
enum class RegistryDataSource { LIVE, CACHE, STALE_CACHE, UNAVAILABLE }

@Serializable
data class RegistryCheckResult(
    val dataSource: RegistryDataSource,
    val lookupOutcome: LookupOutcome,
    val fetchedAt: String? = null,
    val registrationStatus: String? = null,
    val data: RegistryVehicleData? = null,
    /** Enkeltoppslag cannot establish whether bruksforbud exists. */
    val usageProhibitionState: UsageProhibitionState = UsageProhibitionState.UNKNOWN,
    val deviations: List<VehicleDeviation> = emptyList(),
    val snapshotId: String? = null,
    val refreshFailure: LookupOutcome? = null,
)

@Serializable
data class VehicleCheckResponse(
    val id: String,
    val checkedAt: String,
    val vehicle: Vehicle,
    val approvalStatus: ApprovalStatus,
    val approval: StoredApproval? = null,
    val tripRows: List<StoredTripRow>,
    val registry: RegistryCheckResult,
    val deviations: List<VehicleDeviation>,
)

/** Small historical summary: browsing never creates checks or calls SVV. */
@Serializable
data class VehicleCheckSummary(
    val id: String,
    val checkedAt: String,
    val approvalStatus: ApprovalStatus,
    val dataSource: RegistryDataSource,
    val lookupOutcome: LookupOutcome,
    val fetchedAt: String? = null,
    val refreshFailure: LookupOutcome? = null,
    val deviations: List<VehicleDeviation>,
)

@Serializable
data class VehicleOverview(
    val vehicle: Vehicle,
    val approvalStatus: ApprovalStatus,
    val approval: StoredApproval? = null,
    val latestCheck: VehicleCheckSummary? = null,
)

@Serializable
data class VehicleListResponse(
    val items: List<VehicleOverview>, val total: Int, val page: Int, val pageSize: Int, val approvalAsOf: String,
)

@Serializable
data class VehicleDetailsResponse(
    val vehicle: Vehicle,
    val approvalStatus: ApprovalStatus,
    val approvalAsOf: String,
    val approval: StoredApproval? = null,
    val tripRows: List<StoredTripRow>,
    val latestSnapshot: RegistrySnapshot? = null,
    val latestCheck: VehicleCheckSummary? = null,
)

@Serializable
data class VehicleHistoryResponse(
    val items: List<VehicleCheckSummary>, val total: Int, val page: Int, val pageSize: Int,
)

fun normalizeRegistrationNumber(value: String): String =
    value.uppercase(java.util.Locale.ROOT).replace(Regex("[\\s-]"), "")
