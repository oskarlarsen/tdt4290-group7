package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
data class Vehicle(
    val id: String,
    val normalizedRegistrationNumber: String,
    /** Reserved for the future supplier model. Vehicles may currently have no supplier. */
    val supplierId: String? = null,
    val createdAt: String,
)

/** One statistics row, not one unique vehicle. Repeated plates remain separate rows. */
@Serializable
data class TripRowInput(
    val registrationNumber: String,
    val fuel: String? = null,
    val make: String? = null,
    val vehicleType: String? = null,
    val model: String? = null,
    val co2Registered: Boolean? = null,
    val co2GramsPerKm: String? = null,
    val medianCo2: String? = null,
    val totalTripKm: String? = null,
    val totalKmCo2Registered: String? = null,
    val totalKmCo2NotRegistered: String? = null,
    val kmFuelNotRegistered: String? = null,
    val totalKmFuelRegistered: String? = null,
    val tripCount: String? = null,
    val assignmentNumber: String? = null,
    val averageConsumptionLitresPerKm: String? = null,
    val kmPerBus: String? = null,
    val fuelConsumptionLitresPerBus: String? = null,
    val comment: String? = null,
    val additionalFields: Map<String, String> = emptyMap(),
)

@Serializable
data class AppendTripRowsRequest(
    val sourceName: String? = null,
    val rows: List<TripRowInput>,
)

@Serializable
data class StoredTripRow(
    val id: String,
    val vehicleId: String,
    val sourceName: String? = null,
    val createdAt: String,
    val data: TripRowInput,
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
    val fuelTechnology: String? = null,
    val usedThroughoutPeriod: Boolean? = null,
    /** Missing means effective immediately. */
    val startDate: String? = null,
    /** Missing means approved indefinitely, until manually revoked. */
    val expiryDate: String? = null,
    val vehicleGroup: String? = null,
    val additionalFields: Map<String, String> = emptyMap(),
)

@Serializable
data class UpsertApprovalsRequest(
    val sourceName: String? = null,
    val approvals: List<ApprovalInput>,
)

@Serializable
data class StoredApproval(
    val id: String,
    val vehicleId: String,
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
data class VehicleCheckRequest(
    val registrationNumber: String,
    val forceRefresh: Boolean = false,
)

/** A lossless, application-owned tree containing every field returned by SVV. */
@Serializable
sealed interface RegistryValue {
    @Serializable
    @SerialName("object")
    data class ObjectValue(val fields: Map<String, RegistryValue>) : RegistryValue

    @Serializable
    @SerialName("array")
    data class ArrayValue(val items: List<RegistryValue>) : RegistryValue

    @Serializable
    @SerialName("string")
    data class StringValue(val value: String) : RegistryValue

    @Serializable
    @SerialName("number")
    data class NumberValue(val value: String) : RegistryValue

    @Serializable
    @SerialName("boolean")
    data class BooleanValue(val value: Boolean) : RegistryValue

    @Serializable
    @SerialName("null")
    data object NullValue : RegistryValue
}

fun JsonElement.toRegistryValue(): RegistryValue = when (this) {
    is JsonObject -> RegistryValue.ObjectValue(mapValues { (_, value) -> value.toRegistryValue() })
    is JsonArray -> RegistryValue.ArrayValue(map { it.toRegistryValue() })
    JsonNull -> RegistryValue.NullValue
    is JsonPrimitive -> when {
        isString -> RegistryValue.StringValue(content)
        content == "true" || content == "false" -> RegistryValue.BooleanValue(content.toBoolean())
        else -> RegistryValue.NumberValue(content)
    }
}

fun RegistryValue.field(name: String): RegistryValue? =
    (this as? RegistryValue.ObjectValue)?.fields?.get(name)

fun RegistryValue.text(): String? = (this as? RegistryValue.StringValue)?.value

@Serializable
data class RegistrySnapshot(
    val id: String,
    val vehicleId: String,
    val fetchedAt: String,
    val source: String,
    val registrationStatus: String? = null,
    val data: RegistryValue,
)

@Serializable
enum class LookupOutcome {
    FOUND, NOT_FOUND, INVALID_RESPONSE, ACCESS_DENIED, QUOTA_EXHAUSTED,
    TEMPORARILY_UNAVAILABLE, NOT_CONFIGURED,
}

@Serializable
enum class VehicleDeviation {
    NOT_ON_APPROVED_LIST,
    APPROVAL_NOT_YET_ACTIVE,
    APPROVAL_EXPIRED,
    APPROVAL_REVOKED,
    DEREGISTERED,
    EXPORTED,
    SCRAPPED,
    UNREGISTERED,
    UNKNOWN_REGISTRATION_STATUS,
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
    /** Complete SVV response, whether it came from live lookup or a saved snapshot. */
    val data: RegistryValue? = null,
    /** Public Enkeltoppslag cannot establish whether a bruksforbud exists. */
    val usageProhibitionState: UsageProhibitionState = UsageProhibitionState.UNKNOWN,
    val deviations: List<VehicleDeviation> = emptyList(),
    val snapshotId: String? = null,
    /** Present when a refresh failed and stale cached data was returned instead. */
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

fun normalizeRegistrationNumber(value: String): String =
    value.uppercase().replace(Regex("[\\s-]"), "")
