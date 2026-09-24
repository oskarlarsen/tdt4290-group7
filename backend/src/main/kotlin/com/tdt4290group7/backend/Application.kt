package com.tdt4290group7.backend

import com.tdt4290group7.backend.plugins.configureBodyLimit
import com.tdt4290group7.backend.plugins.configureCORS
import com.tdt4290group7.backend.plugins.configureMonitoring
import com.tdt4290group7.backend.plugins.configureRateLimiting
import com.tdt4290group7.backend.plugins.configureRouting
import com.tdt4290group7.backend.plugins.configureSecurity
import com.tdt4290group7.backend.plugins.configureSerialization
import com.tdt4290group7.backend.plugins.configureStatusPages
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.routes.configureAuthRoutes
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    embeddedServer(Netty, port = port, module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    // Fail fast at startup: UserRepository's init throws if SEED_ADMIN_PASSWORD /
    // SEED_SUPPLIER_PASSWORD are missing or blank. Kotlin objects initialize lazily,
    // so touch it here instead of failing on the first auth request.
    require(UserRepository.count > 0) { "User repository failed to seed" }

    configureSerialization()
    configureCORS()
    configureMonitoring()
    configureStatusPages()
    configureBodyLimit()
    configureSecurity()
    configureRateLimiting()
    configureRouting()
    configureAuthRoutes()
}
