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
    val vehicleDatabasePath = Path.of(backendSetting("VEHICLE_DB_PATH") ?: "data/vehicles.db")
    val vehicleRepository = repository ?: VehicleRepository(vehicleDatabasePath)
    val certificateDatabasePath = Path.of(backendSetting("CERTIFICATE_DB_PATH") ?: "data/certificates.db")
    val resolvedCertificateRepository = certificateRepository ?: CertificateRepository(certificateDatabasePath)
    val insightsDatabasePath = Path.of(backendSetting("ADMIN_INSIGHTS_DB_PATH") ?: "data/admin-insights.db")
    val resolvedAdminInsightsRepository = adminInsightsRepository ?: AdminInsightsRepository(insightsDatabasePath)
    configureRouting(vehicleRepository, registry, cacheTtl, resolvedCertificateRepository, resolvedAdminInsightsRepository)
    configureCertificateRoutes(resolvedCertificateRepository, (vehicleRepository as? VehicleRepository)?.fleet)
    (vehicleRepository as? VehicleRepository)?.fleet?.let(::configureAccessRoutes)
    configureAuthRoutes(logResetTokens) { supplierId ->
        (vehicleRepository as? VehicleRepository)?.fleet?.isSupplierActive(supplierId) ?: true
    }
}
