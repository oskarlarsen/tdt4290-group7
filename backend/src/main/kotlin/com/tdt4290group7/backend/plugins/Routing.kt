package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.vehicles.decodeTripRowsRequest
import com.tdt4290group7.backend.vehicles.decodeApprovalsRequest
import com.tdt4290group7.backend.vehicles.decodeVehicleCheckRequest
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
import java.time.LocalDate
import java.time.ZoneId
import com.tdt4290group7.backend.vehicles.ApprovalStatus
import com.tdt4290group7.backend.vehicles.VehicleCheckRequest
import com.tdt4290group7.backend.vehicles.StatisticsCheckResult
import com.tdt4290group7.backend.vehicles.summary
import com.tdt4290group7.backend.vehicles.decodeUpdateApprovalRequest
import com.tdt4290group7.backend.vehicles.ApprovalConflictException
import io.ktor.server.routing.put
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

@Serializable
data class HealthStatus(val status: String = "UP")

@Serializable
data class ApiError(val error: String)

fun Application.configureRouting(
    repository: VehicleStore,
    registry: VehicleRegistryClient?,
    cacheTtl: Duration,
) {
    val checks = VehicleCheckService(repository, registry, cacheTtl)
    routing {
        get("/health") {
            call.respond(HealthStatus())
        }

        get("/") {
            call.respondText("Hello World!")
        }

        get("/api/vehicles") {
            val result = try {
                val status = call.request.queryParameters["approvalStatus"]?.let { ApprovalStatus.valueOf(it) }
                repository.listVehicles(call.request.queryParameters["search"] ?: "", status,
                    pageParameter(call.request.queryParameters["page"], 1), pageParameter(call.request.queryParameters["pageSize"], 25),
                    LocalDate.now(ZoneId.of("Europe/Oslo")))
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid vehicle query"))
                return@get
            }
            call.respond(result)
        }

        get("/api/vehicles/{registrationNumber}") {
            val result = try {
                repository.vehicleDetails(call.parameters["registrationNumber"]!!, LocalDate.now(ZoneId.of("Europe/Oslo")))
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid registration number"))
                return@get
            } ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Vehicle not found"))
            call.respond(result)
        }

        get("/api/vehicles/{registrationNumber}/checks") {
            val result = try {
                repository.checkHistory(call.parameters["registrationNumber"]!!,
                    pageParameter(call.request.queryParameters["page"], 1), pageParameter(call.request.queryParameters["pageSize"], 10))
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid history query"))
                return@get
            } ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Vehicle not found"))
            call.respond(result)
        }

        get("/api/trip-rows") {
            val result = try {
                repository.listTripRows(call.request.queryParameters["search"] ?: "",
                    pageParameter(call.request.queryParameters["page"], 1), pageParameter(call.request.queryParameters["pageSize"], 25))
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid statistics query"))
                return@get
            }
            call.respond(result)
        }

        /** Append first, then check once per distinct plate. Check failures never roll back saved rows. */
        post("/api/trip-rows") {
            val request = try {
                decodeTripRowsRequest(call.receiveText())
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
            val results = response.rows.map { it.registrationNumber }.distinct().map { plate ->
                try {
                    val checked = checks.check(VehicleCheckRequest(plate))
                    StatisticsCheckResult(plate, checked.summary())
                } catch (cause: CancellationException) {
                    throw cause
                } catch (_: Exception) {
                    // Never log a raw plate, supplier observations, SVV payload or exception message.
                    call.application.log.warn("statistics_automatic_check_failed")
                    StatisticsCheckResult(plate, error = "Statistics saved, but automatic verification failed. Retry the check from vehicle details; do not resubmit statistics.")
                }
            }
            call.respond(HttpStatusCode.Created, response.copy(checks = results))
        }.apply {
            install(RequestBodyLimit) {
                bodyLimit { MAX_VEHICLE_BATCH_BODY_BYTES }
            }
        }

        /** Every submitted approval creates a period record, including overlapping recertifications. */
        post("/api/vehicle-approvals") {
            val request = try {
                decodeApprovalsRequest(call.receiveText())
            } catch (_: SerializationException) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid approvals JSON"))
                return@post
            }
            val response = try {
                repository.appendApprovals(request, Instant.now())
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid approvals"))
                return@post
            }
            call.application.log.info("vehicle_approvals_appended approvals={}", response.approvalCount)
            call.respond(HttpStatusCode.Created, response)
        }.apply {
            install(RequestBodyLimit) {
                bodyLimit { MAX_VEHICLE_BATCH_BODY_BYTES }
            }
        }

        /** Revocation retains history. A later approval submission creates a new approval row. */
        post("/api/vehicle-approvals/{approvalId}/revoke") {
            val approvalId = call.parameters["approvalId"]
                ?: return@post call.respond(HttpStatusCode.BadRequest, ApiError("Approval ID is required"))
            val approval = try {
                repository.revokeApproval(approvalId, Instant.now())
            } catch (cause: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid approval ID"))
                return@post
            } ?: return@post call.respond(HttpStatusCode.NotFound, ApiError("Unrevoked approval not found"))
            call.application.log.info("vehicle_approval_revoked approvalId={}", approval.id)
            call.respond(approval)
        }

        put("/api/vehicle-approvals/{approvalId}") {
            val request = try { decodeUpdateApprovalRequest(call.receiveText()) } catch (_: SerializationException) {
                return@put call.respond(HttpStatusCode.BadRequest, ApiError("Invalid approval update JSON"))
            }
            val result = try { repository.updateApproval(call.parameters["approvalId"]!!, request, Instant.now()) }
            catch (_: ApprovalConflictException) { return@put call.respond(HttpStatusCode.Conflict, ApiError("Approval changed or was revoked; reload before editing")) }
            catch (cause: IllegalArgumentException) { return@put call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid approval")) }
                ?: return@put call.respond(HttpStatusCode.NotFound, ApiError("Approval not found"))
            call.respond(result)
        }

        /**
         * Returns local approval/trip data plus cached or live SVV data for one plate.
         * Unknown plates are created automatically with no supplier and no approval.
         */
        post("/api/vehicle-checks") {
            val request = try {
                decodeVehicleCheckRequest(call.receiveText())
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

private fun pageParameter(value: String?, default: Int): Int =
    if (value == null) default else value.toIntOrNull() ?: throw IllegalArgumentException("Pagination values must be integers")
