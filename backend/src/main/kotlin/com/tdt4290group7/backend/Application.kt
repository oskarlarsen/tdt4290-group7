package com.tdt4290group7.backend

import com.tdt4290group7.backend.config.AppEnvironment
import com.tdt4290group7.backend.config.resetTokenLoggingEnabled
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.admin.AdminInsightsRepository
import com.tdt4290group7.backend.plugins.configureBodyLimit
import com.tdt4290group7.backend.plugins.configureCORS
import com.tdt4290group7.backend.plugins.configureMonitoring
import com.tdt4290group7.backend.plugins.configureRateLimiting
import com.tdt4290group7.backend.plugins.configureRequireJsonBody
import com.tdt4290group7.backend.plugins.configureRouting
import com.tdt4290group7.backend.plugins.configureSecurity
import com.tdt4290group7.backend.plugins.configureSerialization
import com.tdt4290group7.backend.plugins.configureStatusPages
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.routes.configureAuthRoutes
import com.tdt4290group7.backend.routes.configureAccessRoutes
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
    adminInsightsRepository: AdminInsightsRepository? = null,
) {
    // Read and validate config first, so a bad combination stops startup before anything runs.
    val environment = AppEnvironment.parse(backendSetting("APP_ENV"))
    val logResetTokens = resetTokenLoggingEnabled(environment, backendSetting("ALLOW_DEV_PASSWORD_RESET_LOG"))
    log.info("Starting in ${environment.name.lowercase()} mode")

    // One database file. The merge of the four old files and WAL only apply to the real file, never to injected test repositories.
    val databasePath = databasePath()
    if (repository == null) {
        LegacyDatabaseMerge.run(databasePath)
        enableWal(databasePath)
    }
    // The vehicle schema goes first, so the account, certificate and alert tables can link to it.
    val vehicleRepository = repository ?: VehicleRepository(databasePath)
    // Kotlin objects initialize lazily, so touch the repository here and fail before serving requests.
    require(UserRepository.count > 0) { "User repository failed to seed" }

    configureSerialization()
    configureCORS()
    configureMonitoring()
    configureStatusPages()
    configureBodyLimit()
    configureRequireJsonBody()
    configureSecurity()
    configureRateLimiting()
    val resolvedCertificateRepository = certificateRepository ?: CertificateRepository(databasePath)
    val resolvedAdminInsightsRepository = adminInsightsRepository ?: AdminInsightsRepository(databasePath)
    configureRouting(vehicleRepository, registry, cacheTtl, resolvedCertificateRepository, resolvedAdminInsightsRepository)
    configureCertificateRoutes(resolvedCertificateRepository, (vehicleRepository as? VehicleRepository)?.fleet)
    (vehicleRepository as? VehicleRepository)?.fleet?.let(::configureAccessRoutes)
    configureAuthRoutes(logResetTokens) { supplierId ->
        (vehicleRepository as? VehicleRepository)?.fleet?.isSupplierActive(supplierId) ?: true
    }
}
