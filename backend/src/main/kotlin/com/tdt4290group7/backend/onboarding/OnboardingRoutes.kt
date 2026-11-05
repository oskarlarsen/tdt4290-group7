package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.model.User
import com.tdt4290group7.backend.plugins.AUTH_JWT
import com.tdt4290group7.backend.plugins.ApiError
import com.tdt4290group7.backend.plugins.MAX_ONBOARDING_UPLOAD_BODY_BYTES
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.vehicles.adminActor
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.utils.io.readRemaining
import io.ktor.utils.io.core.readBytes
import java.time.Instant
import java.util.Locale

internal suspend fun ApplicationCall.supplierOrAdminUser(repository: OnboardingRepository): User? {
    val id = principal<JWTPrincipal>()?.payload?.let(JwtConfig::userId)
    val user = id?.let(UserRepository::findById)
    if (user == null) {
        respond(HttpStatusCode.Unauthorized, ApiError("Authentication required"))
        return null
    }
    if (user.role == Role.SUPPLIER && !repository.isSupplierActive(user.supplierId.orEmpty())) {
        respond(HttpStatusCode.Forbidden, ApiError("Supplier organization is no longer active"))
        return null
    }
    return user
}

internal suspend fun ApplicationCall.resolveSupplierId(user: User): String? {
    if (user.role == Role.ADMIN) {
        val queryId = request.queryParameters["supplierId"]
        if (!queryId.isNullOrBlank()) {
            return queryId.trim()
        }
        // If not specified, return default admin view or prompt
        respond(HttpStatusCode.BadRequest, ApiError("Administrator must specify ?supplierId=<id> to access tenant data"))
        return null
    }

    val sid = user.supplierId
    if (sid.isNullOrBlank()) {
        respond(HttpStatusCode.Forbidden, ApiError("User account is not linked to any supplier organization"))
        return null
    }
    return sid
}

internal fun Route.onboardingRoutes(
    repository: OnboardingRepository,
    certificateRepository: CertificateRepository? = null
) {
    route("/api/onboarding") {
        get("/status") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getOrCreateStatus(supplierId, Instant.now()))
        }

        post("/profile") {
            val user = call.supplierOrAdminUser(repository) ?: return@post
            val supplierId = call.resolveSupplierId(user) ?: return@post
            val input = try {
                call.receive<SupplierProfileInput>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid profile data"))
                return@post
            }
            try {
                call.respond(repository.updateProfile(supplierId, input, Instant.now()))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Invalid profile input"))
            }
        }

        get("/templates/{entity}") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            val entityStr = call.parameters["entity"]?.uppercase(Locale.ROOT)
            val entityType = try {
                BatchEntityType.valueOf(entityStr ?: "")
            } catch (_: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid entity type. Use 'vehicles', 'energy', or 'products'"))
                return@get
            }

            if (repository.requiredAgreementIds(supplierId, entityType).isEmpty()) {
                call.respond(HttpStatusCode.Forbidden, ApiError("Your administrator has not requested this information type"))
                return@get
            }
            val templateCsv = CsvStreamParser.generateTemplate(entityType)
            val fileName = "${entityType.name.lowercase(Locale.ROOT)}_template.csv"

            call.response.header(
                HttpHeaders.ContentDisposition,
                ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, fileName).toString()
            )
            call.respondBytes(
                bytes = ("﻿" + templateCsv).toByteArray(Charsets.UTF_8),
                contentType = ContentType.parse("text/csv; charset=utf-8")
            )
        }

        post("/upload/{entity}/preview") {
            val user = call.supplierOrAdminUser(repository) ?: return@post
            val supplierId = call.resolveSupplierId(user) ?: return@post
            val entityStr = call.parameters["entity"]?.uppercase(Locale.ROOT)
            val entityType = try {
                BatchEntityType.valueOf(entityStr ?: "")
            } catch (_: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid entity type. Use 'vehicles', 'energy', or 'products'"))
                return@post
            }

            var fileName = "upload.csv"
            var fileBytes: ByteArray? = null

            val multipart = call.receiveMultipart()
            multipart.forEachPart { part ->
                if (part is PartData.FileItem) {
                    fileName = part.originalFileName ?: "upload.csv"
                    fileBytes = part.provider().readRemaining().readBytes()
                }
                part.release()
            }

            val uploadedBytes = fileBytes
            if (uploadedBytes == null || uploadedBytes.isEmpty()) {
                call.respond(HttpStatusCode.BadRequest, ApiError("No CSV file uploaded in multipart request"))
                return@post
            }

            try {
                val preview = repository.createBatchPreview(
                    supplierId = supplierId,
                    entityType = entityType,
                    fileName = fileName,
                    fileBytes = uploadedBytes,
                    now = Instant.now()
                )
                call.respond(preview)
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Invalid CSV upload"))
            }
        }.apply {
            install(RequestBodyLimit) {
                bodyLimit { MAX_ONBOARDING_UPLOAD_BODY_BYTES }
            }
        }

        post("/upload/{entity}/confirm") {
            val user = call.supplierOrAdminUser(repository) ?: return@post
            val supplierId = call.resolveSupplierId(user) ?: return@post
            val request = try {
                call.receive<CsvConfirmRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid request JSON"))
                return@post
            }

            try {
                val response = repository.confirmBatch(request.batchId, supplierId, Instant.now())
                call.respond(response)
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Failed to confirm batch"))
            }
        }

        post("/submit") {
            val user = call.supplierOrAdminUser(repository) ?: return@post
            val supplierId = call.resolveSupplierId(user) ?: return@post
            try {
                call.respond(repository.submitOnboarding(supplierId, Instant.now()))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Cannot submit onboarding"))
            }
        }
    }

    route("/api/admin/onboarding/{supplierId}") {
        post("/review") {
            val actor = call.adminActor() ?: return@post
            val targetSupplierId = call.parameters["supplierId"]
            if (targetSupplierId.isNullOrBlank()) {
                call.respond(HttpStatusCode.BadRequest, ApiError("supplierId required in URL path"))
                return@post
            }
            val request = try {
                call.receive<AdminReviewRequest>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Invalid review request JSON"))
                return@post
            }
            try {
                call.respond(repository.reviewOnboarding(targetSupplierId, request, Instant.now()))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Failed to process review"))
            }
        }
    }

    route("/api/supplier") {
        get("/overview") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getSupplierOverview(supplierId, Instant.now()))
        }

        get("/agreements") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getSupplierAgreements(supplierId))
        }

        get("/vehicles") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getSupplierVehicles(supplierId))
        }

        get("/energy") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getSupplierEnergy(supplierId))
        }

        get("/products") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getSupplierProducts(supplierId))
        }

        get("/certificates") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            if (certificateRepository == null) {
                call.respond(emptyList<Certificate>())
                return@get
            }
            val agreements = repository.getSupplierAgreementIds(supplierId)
            val filtered = certificateRepository.getAll().filter { cert ->
                cert.contractId != null && agreements.contains(cert.contractId)
            }
            call.respond(filtered)
        }
    }
}
