package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.vehicles.AppendTripRowsRequest
import com.tdt4290group7.backend.vehicles.UpsertApprovalsRequest
import com.tdt4290group7.backend.vehicles.VehicleCheckRequest
import com.tdt4290group7.backend.vehicles.VehicleCheckService
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.VehicleStore
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.server.application.install
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

@Serializable
data class HealthStatus(val status: String = "UP")

@Serializable
data class ApiError(val error: String)

fun Application.configureRouting(
    repository: VehicleStore,
    registry: VehicleRegistryClient?,
    cacheTtl: Duration,
) {
    val json = Json { ignoreUnknownKeys = false }
    val checks = VehicleCheckService(repository, registry, cacheTtl)
    routing {
        get("/health") {
            call.respond(HealthStatus())
        }

        get("/") {
            call.respondText("Hello World!")
        }

        /** Each submitted statistics row is appended, including repeated registration numbers. */
        post("/api/trip-rows") {
            val request = try {
                json.decodeFromString<AppendTripRowsRequest>(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid trip rows JSON"))
                return@post
            }
            val response = try {
                repository.appendTripRows(request, Instant.now())
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid trip rows"))
                return@post
            }
            call.application.log.info(
                "trip_rows_appended rows={} distinctVehicles={}",
                response.rowCount, response.distinctVehicleCount,
            )
            call.respond(HttpStatusCode.Created, response)
        }.apply {
            install(RequestBodyLimit) {
                bodyLimit { MAX_VEHICLE_BATCH_BODY_BYTES }
            }
        }

        /** Upserts the unrevoked approval for each plate; omitted plates are not affected. */
        post("/api/vehicle-approvals") {
            val request = try {
                json.decodeFromString<UpsertApprovalsRequest>(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid approvals JSON"))
                return@post
            }
            val response = try {
                repository.upsertApprovals(request, Instant.now())
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid approvals"))
                return@post
            }
            call.application.log.info("vehicle_approvals_upserted approvals={}", response.approvalCount)
            call.respond(HttpStatusCode.Created, response)
        }.apply {
            install(RequestBodyLimit) {
                bodyLimit { MAX_VEHICLE_BATCH_BODY_BYTES }
            }
        }

        /** Revocation retains history. A later approval submission creates a new approval row. */
        post("/api/vehicle-approvals/{registrationNumber}/revoke") {
            val registrationNumber = call.parameters["registrationNumber"]
                ?: return@post call.respond(HttpStatusCode.BadRequest, ApiError("Registration number is required"))
            val approval = try {
                repository.revokeApproval(registrationNumber, Instant.now())
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid registration number"))
                return@post
            } ?: return@post call.respond(HttpStatusCode.NotFound, ApiError("Active approval not found"))
            call.application.log.info("vehicle_approval_revoked approvalId={}", approval.id)
            call.respond(approval)
        }

        /**
         * Returns local approval/trip data plus cached or live SVV data for one plate.
         * Unknown plates are created automatically with no supplier and no approval.
         */
        post("/api/vehicle-checks") {
            val request = try {
                json.decodeFromString<VehicleCheckRequest>(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid vehicle check JSON"))
                return@post
            }
            val response = try {
                checks.check(request)
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid vehicle check"))
                return@post
            }
            call.application.log.info(
                "vehicle_check_completed checkId={} registrySource={} deviations={}",
                response.id, response.registry.dataSource, response.deviations.size,
            )
            call.respond(HttpStatusCode.Created, response)
        }

        get("/api/vehicle-checks/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val result = repository.findCheck(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Vehicle check not found"))
            call.respond(result)
        }
    }
}
