package com.tdt4290group7.backend.vehicles

import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.plugins.ApiError
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

fun Route.fleetRoutes(fleet: FleetRepository, registry: VehicleRegistryLookup) {
    get("/api/vehicle-fleet") { if (call.adminActor() != null) call.respond(fleet.overview()) }
    get("/api/procurement/contracts") {
        if (call.adminActor() == null) return@get
        call.respond(fleet.procurementContracts(call.request.queryParameters["supplierId"]))
    }
    post("/api/procurement/contracts/preview") {
        if (call.adminActor() == null) return@post
        val request = decodeFleetRequest(call.receiveText(), ContractCsvRequest.serializer())
        call.respond(fleet.previewContractCsv(request.supplierId, request.csv))
    }
    post("/api/procurement/contracts/import") {
        if (call.adminActor() == null) return@post
        val request = decodeFleetRequest(call.receiveText(), ContractCsvRequest.serializer())
        val result = try {
            fleet.importContractCsv(request.supplierId, request.csv)
        } catch (cause: ContractCsvValidationException) {
            call.respond(HttpStatusCode.Conflict, ApiError(cause.preview.issues.joinToString("; ") { "Row ${it.row}: ${it.message}" }))
            return@post
        }
        call.respond(HttpStatusCode.Created, result)
    }
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
    put("/api/vehicle-fleet/suppliers/{id}") {
        val actor = call.adminActor() ?: return@put
        val request = decodeFleetRequest(call.receiveText(), SupplierUpdate.serializer())
        call.respond(fleet.saveSupplier(call.parameters["id"]!!, request.supplier, actor, Instant.now(), request.expectedUpdatedAt))
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
        val snapshot = registry.verifyEntry(input)
        call.respond(HttpStatusCode.Created, fleet.addVehicle(call.parameters["id"]!!, input, actor, Instant.now(), snapshot))
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
        val snapshot = registry.verifyEntry(request.replacement)
        call.respond(fleet.replaceVehicle(call.parameters["plate"]!!, request, actor, Instant.now(), snapshot))
    }
    post("/api/vehicle-fleet/history/{id}/undo") {
        val actor = call.adminActor() ?: return@post
        fleet.undo(call.parameters["id"]!!, actor, Instant.now())
        call.respond(HttpStatusCode.NoContent)
    }
}
