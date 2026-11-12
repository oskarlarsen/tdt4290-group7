package com.tdt4290group7.backend.vehicles

import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.plugins.ApiError
import com.tdt4290group7.backend.repository.AccountConflictException
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import java.time.Instant

/** Authentication supplies the identity; each vehicle handler checks the admin role. */
internal suspend fun ApplicationCall.adminActor(): ChangeActor? {
    val id = principal<JWTPrincipal>()?.payload?.let(JwtConfig::userId)
    val user = id?.let(UserRepository::findById)
    if (user?.role != com.tdt4290group7.backend.model.Role.ADMIN) {
        respond(HttpStatusCode.Forbidden, ApiError("Administrator access required"))
        return null
    }
    return ChangeActor(user.id, user.name)
}

fun Route.fleetRoutes(fleet: FleetRepository, registry: VehicleRegistryLookup, checks: VehicleCheckService? = null) {
    // Deviations are checked automatically when the admin adds a vehicle; a failed check never undoes the add.
    suspend fun autoCheck(vehicle: Vehicle) {
        if (!vehicle.planned) runCatching { checks?.check(VehicleCheckRequest(vehicle.registrationNumber)) }
    }
    get("/api/vehicle-fleet") { if (call.adminActor() != null) call.respond(fleet.overview()) }
    get("/api/vehicle-fleet/history") {
        if (call.adminActor() == null) return@get
        val rawPage = call.request.queryParameters["page"]
        val page = if (rawPage == null) 1 else rawPage.toIntOrNull() ?: throw IllegalArgumentException("Invalid history page")
        call.respond(fleet.history(page))
    }
    post("/api/vehicle-fleet/suppliers") {
        val actor = call.adminActor() ?: return@post
        call.respond(HttpStatusCode.Created, fleet.saveSupplier(null, decodeFleetRequest(call.receiveText(), SupplierInput.serializer()), actor, Instant.now()))
    }
    post("/api/vehicle-fleet/suppliers/{id}/invitations") {
        val actor = call.adminActor() ?: return@post
        val supplierId = call.parameters["id"] ?: run {
            call.respond(HttpStatusCode.BadRequest, ApiError("Supplier ID is required"))
            return@post
        }
        val supplier = fleet.overview().suppliers.firstOrNull { it.id == supplierId }
        if (supplier == null) {
            call.respond(HttpStatusCode.NotFound, ApiError("Active supplier organization not found"))
            return@post
        }
        val request = try {
            decodeFleetRequest(call.receiveText(), SupplierInvitationRequest.serializer())
        } catch (e: Exception) {
            call.respond(HttpStatusCode.BadRequest, ApiError("Invalid invitation request"))
            return@post
        }
        try {
            val invitation = UserRepository.createSupplierInvitation(
                supplierId = supplier.id,
                supplierName = supplier.name,
                email = request.email
            )
            call.respond(
                HttpStatusCode.Created,
                SupplierInvitationResponse(request.email.trim(), invitation.token, invitation.expiresAt)
            )
        } catch (e: AccountConflictException) {
            call.respond(HttpStatusCode.Conflict, ApiError(e.message ?: "An account already exists"))
        } catch (e: IllegalArgumentException) {
            call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Invalid invitation"))
        }
    }
    put("/api/vehicle-fleet/suppliers/{id}") {
        val actor = call.adminActor() ?: return@put
        val request = decodeFleetRequest(call.receiveText(), SupplierUpdate.serializer())
        call.respond(fleet.saveSupplier(call.parameters["id"]!!, request.supplier, actor, Instant.now(), request.expectedUpdatedAt))
    }
    delete("/api/vehicle-fleet/suppliers/{id}") {
        val actor = call.adminActor() ?: return@delete
        val id = call.parameters["id"] ?: throw IllegalArgumentException("Supplier ID is required")
        val request = decodeFleetRequest(call.receiveText(), VehicleChangeRequest.serializer())
        fleet.removeSupplier(id, request.expectedUpdatedAt, actor, Instant.now())
        call.respond(HttpStatusCode.NoContent)
    }
    post("/api/vehicle-fleet/agreements") {
        val actor = call.adminActor() ?: return@post
        call.respond(HttpStatusCode.Created, fleet.saveAgreement(null, decodeFleetRequest(call.receiveText(), AgreementInput.serializer()), null, actor, Instant.now()))
    }
    put("/api/vehicle-fleet/agreements/{id}") {
        val actor = call.adminActor() ?: return@put
        val request = decodeFleetRequest(call.receiveText(), AgreementUpdate.serializer())
        call.respond(fleet.saveAgreement(call.parameters["id"]!!, request.agreement, request.expectedUpdatedAt, actor, Instant.now()))
    }
    delete("/api/vehicle-fleet/agreements/{id}") {
        val actor = call.adminActor() ?: return@delete
        val request = decodeFleetRequest(call.receiveText(), VehicleChangeRequest.serializer())
        fleet.removeAgreement(call.parameters["id"]!!, request.expectedUpdatedAt, actor, Instant.now())
        call.respond(HttpStatusCode.NoContent)
    }
    post("/api/vehicle-fleet/agreements/{id}/vehicles") {
        val actor = call.adminActor() ?: return@post
        val input = decodeFleetRequest(call.receiveText(), VehicleEntryInput.serializer())
        // Never hold a SQLite write lock during a remote lookup. Capacity is checked at commit time.
        val (snapshot, problem) = registry.checkForList(input)
        val added = fleet.addVehicle(call.parameters["id"]!!, input, actor, Instant.now(), snapshot, problem)
        autoCheck(added)
        call.respond(HttpStatusCode.Created, added)
    }
    post("/api/vehicle-fleet/agreements/{id}/vehicles/bulk") {
        val actor = call.adminActor() ?: return@post
        val plates = decodeFleetRequest(call.receiveText(), BulkVehicleRequest.serializer()).registrationNumbers.distinct()
        require(plates.size in 1..200) { "Send between 1 and 200 registration numbers" }
        val added = mutableListOf<String>()
        val failed = mutableListOf<BulkVehicleFailure>()
        // One by one: a bad plate must not block the rest, and each add keeps its own history entry.
        for (plate in plates) try {
            val input = VehicleEntryInput(plate)
            val (snapshot, problem) = registry.checkForList(input)
            val vehicle = fleet.addVehicle(call.parameters["id"]!!, input, actor, Instant.now(), snapshot, problem)
            autoCheck(vehicle)
            added += vehicle.registrationNumber
        } catch (e: Exception) {
            failed += BulkVehicleFailure(plate, e.message ?: "Could not be added")
        }
        call.respond(HttpStatusCode.Created, BulkVehicleResult(added, failed))
    }
    delete("/api/vehicle-fleet/vehicles/{plate}") {
        val actor = call.adminActor() ?: return@delete
        val request = decodeFleetRequest(call.receiveText(), VehicleChangeRequest.serializer())
        fleet.removeVehicle(call.parameters["plate"]!!, request.expectedUpdatedAt, actor, Instant.now())
        call.respond(HttpStatusCode.NoContent)
    }
    post("/api/vehicle-fleet/vehicles/{plate}/replace") {
        val actor = call.adminActor() ?: return@post
        val request = decodeFleetRequest(call.receiveText(), ReplacementRequest.serializer())
        val (snapshot, problem) = registry.checkForList(request.replacement)
        call.respond(fleet.replaceVehicle(call.parameters["plate"]!!, request, actor, Instant.now(), snapshot, problem))
    }
    post("/api/vehicle-fleet/vehicles/{plate}/exception") {
        val actor = call.adminActor() ?: return@post
        val request = decodeFleetRequest(call.receiveText(), ExceptionRequest.serializer())
        fleet.approveException(normalizeRegistrationNumber(call.parameters["plate"]!!), request.note, actor, Instant.now())
        call.respond(HttpStatusCode.NoContent)
    }
    post("/api/vehicle-fleet/history/{id}/undo") {
        val actor = call.adminActor() ?: return@post
        fleet.undo(call.parameters["id"]!!, actor, Instant.now())
        call.respond(HttpStatusCode.NoContent)
    }
}
