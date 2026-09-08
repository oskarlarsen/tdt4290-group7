package com.tdt4290group7.backend.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable

@Serializable
data class HealthStatus(val status: String = "UP")

fun Application.configureRouting() {
    routing {
        get("/health") {
            call.respond(HealthStatus())
        }

        get("/") {
            call.respondText("Hello World!")
        }
    }
}
