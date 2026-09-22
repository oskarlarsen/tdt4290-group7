package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.vehicles.VehicleCheckService
import com.tdt4290group7.backend.vehicles.ApprovedVehicleImportRequest
import com.tdt4290group7.backend.vehicles.VehicleComparisonRequest
import com.tdt4290group7.backend.vehicles.VehicleComparisonService
import com.tdt4290group7.backend.vehicles.VehicleImportRequest
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.VehicleStore
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

@Serializable
data class HealthStatus(val status: String = "UP")

@Serializable
data class ApiError(val error: String)

fun Application.configureRouting(repository: VehicleStore, registry: VehicleRegistryClient?) {
    val json = Json { ignoreUnknownKeys = false }
    val checks = registry?.let { VehicleCheckService(repository, it) }
    val comparisons = VehicleComparisonService(repository)
    routing {
        get("/health") {
            call.respond(HealthStatus())
        }

        get("/") {
            call.respondText("Hello World!")
        }

        post("/api/vehicle-imports") {
            val request = try {
                json.decodeFromString<VehicleImportRequest>(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid vehicle import JSON"))
                return@post
            }
            val response = try {
                repository.insertImport(request)
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid vehicle import"))
                return@post
            }
            call.application.log.info(
                "vehicle_import_created importId={} rows={} distinctVehicles={}",
                response.id,
                response.rowCount,
                response.distinctVehicleCount,
            )
            call.respond(HttpStatusCode.Created, response)
        }

        post("/api/approved-vehicle-imports") {
            val request = try {
                json.decodeFromString<ApprovedVehicleImportRequest>(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid approved vehicle import JSON"))
                return@post
            }
            val response = try {
                repository.insertApprovedImport(request)
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid approved vehicle import"))
                return@post
            }
            call.application.log.info(
                "approved_vehicle_import_created importId={} rows={} distinctVehicles={}",
                response.id, response.rowCount, response.distinctVehicleCount,
            )
            call.respond(HttpStatusCode.Created, response)
        }

        get("/api/approved-vehicle-imports/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val approvedImport = repository.findApprovedImport(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Approved import not found"))
            call.respond(approvedImport)
        }

        get("/api/approved-vehicle-imports/{id}/rows") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            if (repository.findApprovedImport(id) == null) {
                call.respond(HttpStatusCode.NotFound, ApiError("Approved import not found"))
                return@get
            }
            call.respond(repository.approvedRowsForImport(id))
        }

        post("/api/vehicle-comparisons") {
            val request = try {
                json.decodeFromString<VehicleComparisonRequest>(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid comparison JSON"))
                return@post
            }
            val result = comparisons.compare(request)
                ?: return@post call.respond(HttpStatusCode.NotFound, ApiError("Trip or approved import not found"))
            call.application.log.info(
                "vehicle_comparison_completed comparisonId={} tripImportId={} approvedImportId={} compared={} unapproved={}",
                result.id, result.tripImportId, result.approvedImportId,
                result.comparedVehicleCount, result.unapprovedVehicleCount,
            )
            call.respond(HttpStatusCode.Created, result)
        }

        get("/api/vehicle-comparisons/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val result = repository.findComparison(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Comparison not found"))
            call.respond(result)
        }

        get("/api/vehicle-imports/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val vehicleImport = repository.findImport(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Import not found"))
            call.respond(vehicleImport)
        }

        get("/api/vehicle-imports/{id}/rows") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            if (repository.findImport(id) == null) {
                call.respond(HttpStatusCode.NotFound, ApiError("Import not found"))
                return@get
            }
            call.respond(repository.rowsForImport(id))
        }

        post("/api/vehicle-imports/{id}/checks") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            if (checks == null) {
                call.respond(HttpStatusCode.ServiceUnavailable, ApiError("SVV_API_KEY is not configured"))
                return@post
            }
            val run = checks.checkImport(id)
                ?: return@post call.respond(HttpStatusCode.NotFound, ApiError("Import not found"))
            call.application.log.info(
                "vehicle_check_completed runId={} importId={} checked={} deviations={} unavailable={}",
                run.id,
                run.importId,
                run.checkedCount,
                run.deviationCount,
                run.unavailableCount,
            )
            call.respond(HttpStatusCode.Created, run)
        }

        get("/api/vehicle-imports/{id}/checks/latest") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val run = repository.latestCheckRun(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("No check run found"))
            call.respond(run)
        }
    }
}
