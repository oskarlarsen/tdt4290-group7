package com.tdt4290group7.backend

import com.tdt4290group7.backend.config.AppEnvironment
import com.tdt4290group7.backend.config.resetTokenLoggingEnabled
import com.tdt4290group7.backend.certificates.CertificateRepository
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
import com.tdt4290group7.backend.routes.configureCertificateRoutes
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.VehicleStore
import com.tdt4290group7.backend.vehicles.VegvesenVehicleRegistryClient
import io.ktor.server.application.Application
import io.ktor.server.application.log
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import java.nio.file.Path
import java.time.Duration

fun main() {
    val port = backendSetting("PORT")?.toIntOrNull() ?: 8080
    val host = backendSetting("HOST") ?: "127.0.0.1"
    embeddedServer(Netty, host = host, port = port, module = Application::module)
        .start(wait = true)
}

fun Application.module(
    repository: VehicleStore? = null,
    registry: VehicleRegistryClient? = svvApiKey()?.let(::VegvesenVehicleRegistryClient),
    cacheTtl: Duration = Duration.ofDays(svvCacheTtlDays()),
    certificateRepository: CertificateRepository? = null,
) {
    // Read and validate config first, so a bad combination stops startup before anything runs.
    val environment = AppEnvironment.parse(backendSetting("APP_ENV"))
    val logResetTokens = resetTokenLoggingEnabled(environment, backendSetting("ALLOW_DEV_PASSWORD_RESET_LOG"))
    log.info("Starting in ${environment.name.lowercase()} mode")

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
    val vehicleDatabasePath = Path.of(backendSetting("VEHICLE_DB_PATH") ?: "data/vehicles.db")
    val vehicleRepository = repository ?: VehicleRepository(vehicleDatabasePath)
    configureRouting(vehicleRepository, registry, cacheTtl)
    val certificateDatabasePath = Path.of(backendSetting("CERTIFICATE_DB_PATH") ?: "data/certificates.db")
    configureCertificateRoutes(certificateRepository ?: CertificateRepository(certificateDatabasePath))
    configureAuthRoutes(logResetTokens)
}
