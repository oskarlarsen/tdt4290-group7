package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.vehicles.decodeTripRowsRequest
import com.tdt4290group7.backend.vehicles.decodeVehicleCheckRequest
import com.tdt4290group7.backend.vehicles.VehicleCheckService
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.VehicleRegistryLookup
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
import com.tdt4290group7.backend.vehicles.VehicleCheckRequest
import com.tdt4290group7.backend.vehicles.StatisticsCheckResult
import com.tdt4290group7.backend.vehicles.summary
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.fleetRoutes
import com.tdt4290group7.backend.vehicles.adminActor
import io.ktor.server.auth.authenticate
import kotlinx.serialization.SerializationException

import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.onboarding.onboardingRoutes
import com.tdt4290group7.backend.admin.adminDashboardRoutes
import com.tdt4290group7.backend.admin.AdminInsightsRepository

@Serializable
data class HealthStatus(val status: String = "UP")

@Serializable
data class ApiError(val error: String)

fun Application.configureRouting(
    repository: VehicleStore,
    registry: VehicleRegistryClient?,
    cacheTtl: Duration,
    certificateRepository: CertificateRepository? = null,
    adminInsightsRepository: AdminInsightsRepository? = null,
) {
    val registryLookup = VehicleRegistryLookup(registry, cacheTtl)
    val checks = VehicleCheckService(repository, registry, cacheTtl, registryLookup = registryLookup)
    routing {
        get("/health") {
            call.respond(HealthStatus())
        }

        get("/") {
            call.respondText("Hello World!")
        }

        authenticate(AUTH_JWT) {
            if (repository is VehicleRepository) {
                repository.onboarding.attachCertificateRepository(certificateRepository)
                fleetRoutes(repository.fleet, registryLookup)
                onboardingRoutes(repository.onboarding, certificateRepository, registryLookup)
                if (certificateRepository != null && adminInsightsRepository != null) {
                    adminDashboardRoutes(repository.fleet, repository, certificateRepository, adminInsightsRepository)
                }
            }
            get("/api/vehicles/{registrationNumber}") {
                if (call.adminActor() == null) return@get
                val result = try {
                    repository.vehicleDetails(call.parameters["registrationNumber"]!!)
                } catch (cause: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid registration number"))
                    return@get
                } ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Vehicle not found"))
                call.respond(result)
            }

            get("/api/vehicles/{registrationNumber}/checks") {
                if (call.adminActor() == null) return@get
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
                if (call.adminActor() == null) return@get
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
                if (call.adminActor() == null) return@post
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

            /**
             * Returns local agreement/statistics data plus cached or live SVV data for one plate.
             * Unknown plates are created without an agreement.
             */
            post("/api/vehicle-checks") {
                if (call.adminActor() == null) return@post
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
                if (call.adminActor() == null) return@get
                val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
                val result = repository.findCheck(id)
                    ?: return@get call.respond(HttpStatusCode.NotFound, ApiError("Vehicle check not found"))
                call.respond(result)
            }
        }
    }
}

private fun pageParameter(value: String?, default: Int): Int =
    if (value == null) default else value.toIntOrNull() ?: throw IllegalArgumentException("Pagination values must be integers")
