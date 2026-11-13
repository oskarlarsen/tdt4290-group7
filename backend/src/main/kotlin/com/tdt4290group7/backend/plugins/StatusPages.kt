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
        exception<kotlinx.serialization.SerializationException> { call, _ ->
            call.respond(HttpStatusCode.BadRequest, ApiError("Ugyldig JSON i forespørselen"))
        }
        exception<com.tdt4290group7.backend.vehicles.FleetConflictException> { call, cause ->
            call.respond(HttpStatusCode.Conflict, ApiError(cause.message ?: "Oppføringen er endret"))
        }
        exception<IllegalArgumentException> { call, cause ->
            call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Ugyldig inndata"))
        }
        exception<VehicleStorageBusyException> { call, _ ->
            call.application.log.warn("vehicle_storage_busy")
            call.respond(HttpStatusCode.ServiceUnavailable, ApiError("Kjøretøydatabasen er opptatt. Prøv igjen senere"))
        }
        exception<com.tdt4290group7.backend.vehicles.RegistryUnavailableException> { call, cause ->
            call.respond(HttpStatusCode.ServiceUnavailable, ApiError(cause.message!!))
        }
        // Client errors: answer them as such instead of logging a server stack trace for each.
        exception<PayloadTooLargeException> { call, _ ->
            call.respondText(text = "Forespørselen er for stor", status = HttpStatusCode.PayloadTooLarge)
        }
        exception<BadRequestException> { call, cause ->
            // Body deserialization wraps the limit error when the size isn't known up front
            // (chunked uploads), so look for it in the cause chain.
            if (generateSequence<Throwable>(cause) { it.cause }.any { it is PayloadTooLargeException }) {
                call.respondText(text = "Forespørselen er for stor", status = HttpStatusCode.PayloadTooLarge)
            } else {
                call.respondText(text = "Ugyldig forespørsel", status = HttpStatusCode.BadRequest)
            }
        }
        exception<Throwable> { call, cause ->
            if (cause is kotlinx.coroutines.CancellationException) throw cause
            call.application.log.error("Unhandled exception", cause)
            call.respondText(text = "Intern serverfeil", status = HttpStatusCode.InternalServerError)
        }
    }
}
