package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.vehicles.VehicleStorageBusyException
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.PayloadTooLargeException
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.response.respondText

fun Application.configureStatusPages() {
    install(StatusPages) {
        exception<VehicleStorageBusyException> { call, _ ->
            call.application.log.warn("vehicle_storage_busy")
            call.respond(HttpStatusCode.ServiceUnavailable, ApiError("Vehicle database is busy; try again later"))
        }
        // Client errors: answer them as such instead of logging a server stack trace for each.
        exception<PayloadTooLargeException> { call, _ ->
            call.respondText(text = "Request body too large", status = HttpStatusCode.PayloadTooLarge)
        }
        exception<BadRequestException> { call, cause ->
            // Body deserialization wraps the limit error when the size isn't known up front
            // (chunked uploads), so look for it in the cause chain.
            if (generateSequence<Throwable>(cause) { it.cause }.any { it is PayloadTooLargeException }) {
                call.respondText(text = "Request body too large", status = HttpStatusCode.PayloadTooLarge)
            } else {
                call.respondText(text = "Malformed request", status = HttpStatusCode.BadRequest)
            }
        }
        exception<Throwable> { call, cause ->
            if (cause is kotlinx.coroutines.CancellationException) throw cause
            call.application.log.error("Unhandled exception", cause)
            call.respondText(text = "Internal server error", status = HttpStatusCode.InternalServerError)
        }
    }
}
