@file:kotlinx.serialization.UseSerializers(DecimalSerializer::class)
@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import kotlinx.serialization.Serializable

@Serializable
data class Vehicle(
    val registrationNumber: String,
    val createdAt: String,
    val agreementId: String? = null,
    val planned: Boolean = false,
    val listed: Boolean = false,
    val updatedAt: String = createdAt,
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
    val co2GramsPerKm: BigDecimal?,
    val totalTripKm: BigDecimal,
    val totalKmCo2Registered: BigDecimal?,
    val totalKmCo2NotRegistered: BigDecimal,
    val kmFuelNotRegistered: BigDecimal,
    val totalKmFuelRegistered: BigDecimal,
    val totalKmNoxRegistered: BigDecimal?,
    val totalNoxRegisteredGrams: BigDecimal?,
    val vehicleCategory: VehicleCategory,
    val averageFuelConsumptionLitresPer100Km: BigDecimal? = null,
    val fuelConsumedLitres: BigDecimal? = null,
    val comment: String? = null,
)

fun TripRowInput.estimateCo2Kg(): BigDecimal? =
    co2GramsPerKm?.let { totalTripKm.multiply(it).movePointLeft(3).stripTrailingZeros() }

@Serializable
data class AppendTripRowsRequest(val sourceName: String? = null, val rows: List<TripRowInput>)

@Serializable
data class StoredTripRow(
    val id: String,
    val registrationNumber: String,
    val sourceName: String? = null,
    val createdAt: String,
    val data: TripRowInput,
    /** Read-only supplier-based estimate; null when emissions are not applicable. */
    @kotlinx.serialization.EncodeDefault
    val estimatedCo2Kg: BigDecimal? = data.estimateCo2Kg(),
)

@Serializable
data class AppendTripRowsResponse(
    val createdAt: String,
    val rowCount: Int,
    val distinctVehicleCount: Int,
    val rows: List<StoredTripRow>,
    /** One result per distinct plate, populated by the HTTP save workflow after persistence. */
    @kotlinx.serialization.EncodeDefault
    val checks: List<StatisticsCheckResult> = emptyList(),
)

@Serializable
data class StatisticsCheckResult(
    val registrationNumber: String,
    val check: VehicleCheckSummary? = null,
    /** Safe generic error: statistics remain saved when checking fails. */
    val error: String? = null,
)

@Serializable
data class TripRowsListResponse(
    val items: List<StoredTripRow>, val total: Int, val page: Int, val pageSize: Int,
)

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
    val lastApprovedInspectionDate: String? = null,
    val nextInspectionDueDate: String? = null,
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
    NOT_ON_AGREEMENT_LIST, AGREEMENT_NOT_STARTED, AGREEMENT_EXPIRED,
    DEREGISTERED, EXPORTED, SCRAPPED, UNREGISTERED, UNKNOWN_REGISTRATION_STATUS,
    AGREEMENT_PERIOD_NOT_COVERED,
    FUEL_MISMATCH, CATEGORY_MISMATCH, BODY_TYPE_MISMATCH, BRAND_MISMATCH, MODEL_MISMATCH,
    CO2_CLASSIFICATION_MISMATCH, CO2_MISMATCH, REGISTRY_CO2_DISAGREEMENT, NOX_MISMATCH, CONSUMPTION_MISMATCH,
    OVERLAPPING_STATISTICS, UNABLE_TO_VERIFY,
}

@Serializable
enum class DeviationPriority { MODERATE, HIGH }

@Serializable
enum class DeviationOrigin { AGREEMENT, REGISTRY, STATISTICS }

/** Each occurrence is a deviation. Descriptions may explain review/verification uncertainty. */
@Serializable
data class DeviationFinding(
    val code: VehicleDeviation, val priority: DeviationPriority, val origin: DeviationOrigin, val description: String,
    val tripRowId: String? = null, val relatedTripRowId: String? = null,
    val fuelIndex: Int? = null, val measurementIndex: Int? = null,
)

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
    val agreement: AgreementEvidence? = null,
    val tripRows: List<StoredTripRow>,
    val registry: RegistryCheckResult,
    val deviations: List<VehicleDeviation>,
    @kotlinx.serialization.EncodeDefault val findings: List<DeviationFinding> = emptyList(),
)

/** Small historical summary: browsing never creates checks or calls SVV. */
@Serializable
data class VehicleCheckSummary(
    val id: String,
    val checkedAt: String,
    val dataSource: RegistryDataSource,
    val lookupOutcome: LookupOutcome,
    val fetchedAt: String? = null,
    val refreshFailure: LookupOutcome? = null,
    val deviations: List<VehicleDeviation>,
    @kotlinx.serialization.EncodeDefault val highPriorityCount: Int = 0,
    @kotlinx.serialization.EncodeDefault val moderatePriorityCount: Int = 0,
)

internal fun VehicleCheckResponse.summary() = VehicleCheckSummary(id, checkedAt, registry.dataSource,
    registry.lookupOutcome, registry.fetchedAt, registry.refreshFailure, deviations,
    findings.count { it.priority == DeviationPriority.HIGH }, findings.count { it.priority == DeviationPriority.MODERATE })

@Serializable
data class VehicleDetailsResponse(
    val vehicle: Vehicle,
    val agreement: AgreementEvidence? = null,
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
