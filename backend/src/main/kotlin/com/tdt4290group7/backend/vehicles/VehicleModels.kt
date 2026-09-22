package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One imported row, not one unique vehicle. Repeated plates retain their separate statistics. */
@Serializable
data class VehicleRowInput(
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
data class VehicleImportRequest(
    val sourceName: String,
    val rows: List<VehicleRowInput>,
)

@Serializable
data class VehicleImportResponse(
    val id: String,
    val sourceName: String,
    val createdAt: String,
    val rowCount: Int,
    val distinctVehicleCount: Int,
)

@Serializable
data class StoredVehicleRow(
    val id: String,
    val importId: String,
    val rowNumber: Int,
    val normalizedRegistrationNumber: String,
    val data: VehicleRowInput,
)

/** One row in the separately supplied approved-vehicle list. */
@Serializable
data class ApprovedVehicleRowInput(
    val registrationNumber: String,
    val fuelTechnology: String? = null,
    val usedThroughoutPeriod: Boolean? = null,
    /** ISO-8601 date (yyyy-MM-dd), when supplied by the frontend. */
    val startDate: String? = null,
    val endDate: String? = null,
    /** Spreadsheet section, retained as supplied; not used as a compliance rule. */
    val vehicleGroup: String? = null,
    val additionalFields: Map<String, String> = emptyMap(),
)

@Serializable
data class ApprovedVehicleImportRequest(
    val sourceName: String,
    val rows: List<ApprovedVehicleRowInput>,
)

@Serializable
data class StoredApprovedVehicleRow(
    val id: String,
    val importId: String,
    val rowNumber: Int,
    val normalizedRegistrationNumber: String,
    val data: ApprovedVehicleRowInput,
)

@Serializable
data class ApprovedVehicleImportResponse(
    val id: String,
    val sourceName: String,
    val createdAt: String,
    val rowCount: Int,
    val distinctVehicleCount: Int,
)

@Serializable
data class VehicleComparisonRequest(val tripImportId: String, val approvedImportId: String)

@Serializable
enum class ApprovalMatch { ON_APPROVED_LIST, NOT_ON_APPROVED_LIST }

@Serializable
data class VehicleComparisonResult(
    val normalizedRegistrationNumber: String,
    val tripRowIds: List<String>,
    val approvedRowIds: List<String>,
    val approvalMatch: ApprovalMatch,
)

@Serializable
data class VehicleComparisonResponse(
    val id: String,
    val tripImportId: String,
    val approvedImportId: String,
    val createdAt: String,
    val comparedVehicleCount: Int,
    val unapprovedVehicleCount: Int,
    val results: List<VehicleComparisonResult>,
)

/** A lossless, application-owned tree, not a persisted third-party JSON document. */
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
    val normalizedRegistrationNumber: String,
    val fetchedAt: String,
    val source: String,
    val registrationStatus: String?,
    val data: RegistryValue,
)

@Serializable
enum class LookupOutcome { FOUND, NOT_FOUND, INVALID_RESPONSE, ACCESS_DENIED, QUOTA_EXHAUSTED, TEMPORARILY_UNAVAILABLE }

@Serializable
enum class VehicleDeviation { DEREGISTERED, EXPORTED, SCRAPPED, UNREGISTERED, UNKNOWN_REGISTRATION_STATUS }

@Serializable
enum class UsageProhibitionState { ACTIVE, FUTURE, NONE, UNKNOWN }

@Serializable
data class VehicleCheckResult(
    val normalizedRegistrationNumber: String,
    val checkedAt: String,
    val lookupOutcome: LookupOutcome,
    val registrationStatus: String? = null,
    /** Public Enkeltoppslag cannot establish whether a bruksforbud exists. */
    val usageProhibitionState: UsageProhibitionState = UsageProhibitionState.UNKNOWN,
    val deviations: List<VehicleDeviation> = emptyList(),
    val registrySnapshotId: String? = null,
)

@Serializable
data class VehicleCheckRunResponse(
    val id: String,
    val importId: String,
    val startedAt: String,
    val completedAt: String,
    val checkedCount: Int,
    val deviationCount: Int,
    val unavailableCount: Int,
    val results: List<VehicleCheckResult>,
)

fun normalizeRegistrationNumber(value: String): String =
    value.uppercase().replace(Regex("[\\s-]"), "")
