package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.vehicles.VehicleStorageBusyException
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.response.respondText

fun Application.configureStatusPages() {
    install(StatusPages) {
        exception<VehicleStorageBusyException> { call, _ ->
            call.application.log.warn("vehicle_storage_busy")
            call.respond(HttpStatusCode.ServiceUnavailable, ApiError("Vehicle database is busy; try again later"))
        }
        exception<Throwable> { call, cause ->
            if (cause is kotlinx.coroutines.CancellationException) throw cause
            call.application.log.error("Unhandled exception", cause)
            call.respondText(text = "Internal server error", status = HttpStatusCode.InternalServerError)
        }
    }
}
