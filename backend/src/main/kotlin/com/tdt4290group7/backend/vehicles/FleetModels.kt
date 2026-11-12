package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.Serializable

@Serializable
data class FleetSupplier(val id: String, val name: String, val orgNumber: String, val active: Boolean = true,
    /** Older saved checks may not have recorded a supplier timestamp. */
    val updatedAt: String? = null)

@Serializable
data class SupplierInput(val name: String, val orgNumber: String,
    /** Set after the admin answered "no, this is a new supplier" to the archived-name warning. */
    val confirmNewSupplier: Boolean = false)

@Serializable
data class SupplierInvitationRequest(val email: String)

@Serializable
data class SupplierInvitationResponse(val email: String, val token: String, val expiresAt: String)

@Serializable
data class SupplierUpdate(val supplier: SupplierInput, val expectedUpdatedAt: String)

@Serializable
data class AgreementInput(val supplierId: String, val startDate: String, val endDate: String,
    val allowedVehicles: Int, val note: String = "", val requiresVehicles: Boolean = true,
    val requiresEnergy: Boolean = false, val requiresProducts: Boolean = false,
    /** Required case number; the empty default only exists so a missing field reaches the validation message. */
    val saksnr: String = "")

@Serializable
data class FleetAgreement(val id: String, val supplierId: String, val startDate: String, val endDate: String,
    val allowedVehicles: Int, val note: String, val updatedAt: String, val active: Boolean = true,
    val requiresVehicles: Boolean = true, val requiresEnergy: Boolean = false, val requiresProducts: Boolean = false,
    val saksnr: String? = null)

/** Display name for an agreement: "saksnr — note", falling back to "Saksnr mangler" for agreements created before saksnr existed. */
fun agreementLabel(saksnr: String?, note: String): String {
    val number = saksnr?.trim()?.takeIf(String::isNotEmpty) ?: "Saksnr mangler"
    val text = note.trim()
    return if (text.isEmpty()) number else "$number — $text"
}

@Serializable
data class AgreementUpdate(val agreement: AgreementInput, val expectedUpdatedAt: String)

@Serializable
data class VehicleEntryInput(val registrationNumber: String? = null, val planned: Boolean = false)

internal fun VehicleEntryInput.validatedRegistrationNumber(): String? {
    if (planned) {
        require(registrationNumber.isNullOrBlank()) { "Planlagte identifikatorer genereres automatisk" }
        return null
    }
    return normalizeRegistrationNumber(requireNotNull(registrationNumber) { "Skriv inn registreringsnummeret" }).also {
        require(it.matches(Regex("[A-Z]{2}[1-9][0-9]{3,4}"))) { "Skriv inn et gyldig registreringsnummer" }
    }
}

@Serializable
data class ExceptionRequest(val note: String? = null)

@Serializable
data class BulkVehicleRequest(val registrationNumbers: List<String>)

@Serializable
data class BulkVehicleFailure(val registrationNumber: String, val reason: String)

@Serializable
data class BulkVehicleResult(val added: List<String>, val failed: List<BulkVehicleFailure>)

@Serializable
data class VehicleChangeRequest(val expectedUpdatedAt: String)

@Serializable
data class ReplacementRequest(val replacement: VehicleEntryInput, val expectedUpdatedAt: String)

/** Frozen evidence; subsequent agreement edits never rewrite a saved check. */
@Serializable
data class AgreementEvidence(val agreement: FleetAgreement, val supplier: FleetSupplier)

@Serializable
data class FleetChange(val id: String, val occurredAt: String, val actorName: String, val description: String,
    val agreementId: String? = null, val reversedBy: String? = null, val undoOf: String? = null,
    val canUndo: Boolean = false)

@Serializable
data class FleetOverview(val suppliers: List<FleetSupplier>, val agreements: List<FleetAgreement>,
    val vehicles: List<Vehicle>, val changes: List<FleetChange>)

data class ChangeActor(val id: String, val name: String)

/** An archived supplier with its earlier agreements and vehicles, for admins who need the history. */
@Serializable
data class ArchivedSupplier(val supplier: FleetSupplier, val archivedAt: String?, val agreements: List<FleetAgreement>, val vehicles: List<Vehicle>)

@Serializable
data class FleetArchive(val suppliers: List<ArchivedSupplier>)

/** Answer to adding a supplier whose organization number belonged to an archived one: ask "is this the same supplier?". */
@Serializable
data class ArchivedSupplierMatch(val error: String, val code: String, val supplier: FleetSupplier, val archivedAt: String?, val agreementCount: Int)

class ArchivedSupplierMatchException(val match: ArchivedSupplierMatch) : RuntimeException(match.error)

class FleetConflictException(message: String) : RuntimeException(message)
