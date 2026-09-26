package com.tdt4290group7.backend

import com.tdt4290group7.backend.plugins.configureCORS
import com.tdt4290group7.backend.plugins.configureMonitoring
import com.tdt4290group7.backend.plugins.configureRateLimiting
import com.tdt4290group7.backend.plugins.configureRouting
import com.tdt4290group7.backend.plugins.configureSecurity
import com.tdt4290group7.backend.plugins.configureSerialization
import com.tdt4290group7.backend.plugins.configureStatusPages
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.VehicleStore
import com.tdt4290group7.backend.vehicles.VegvesenVehicleRegistryClient
import com.tdt4290group7.backend.routes.configureAuthRoutes
import io.ktor.server.application.Application
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import java.nio.file.Path

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    val host = System.getenv("HOST") ?: "127.0.0.1"
    embeddedServer(Netty, host = host, port = port, module = Application::module)
        .start(wait = true)
}

fun Application.module(
    repository: VehicleStore = VehicleRepository(
        Path.of(System.getenv("VEHICLE_DB_PATH") ?: "data/vehicles.db"),
    ),
    registry: VehicleRegistryClient? = svvApiKey()?.let(::VegvesenVehicleRegistryClient),
) {
    configureSerialization()
    configureCORS()
    configureMonitoring()
    configureStatusPages()
    configureSecurity()
    configureRateLimiting()
    configureRouting(repository, registry)
    configureAuthRoutes()
}
