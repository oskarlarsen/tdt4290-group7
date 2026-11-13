package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.plugins.ApiError
import com.tdt4290group7.backend.vehicles.adminActor
import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.application.install
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.utils.io.core.readBytes
import io.ktor.utils.io.readRemaining
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

const val MAX_ENERGY_EVIDENCE_BYTES = 10 * 1024 * 1024

// The type comes from the extension, never from what the client claims, so a ".png" cannot be served as HTML.
private val EVIDENCE_TYPES = mapOf(
    "pdf" to "application/pdf",
    "png" to "image/png",
    "jpg" to "image/jpeg",
    "jpeg" to "image/jpeg",
    "csv" to "text/csv",
    "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
)

private suspend fun ApplicationCall.respondEvidence(file: Pair<EnergyEvidenceInfo, ByteArray>?) {
    if (file == null) {
        respond(HttpStatusCode.NotFound, ApiError("Fant ikke dokumentasjonsfilen"))
        return
    }
    val (info, bytes) = file
    response.header(HttpHeaders.ContentDisposition, ContentDisposition.Attachment.withParameter("filename", info.fileName).toString())
    response.header("X-Content-Type-Options", "nosniff")
    respondBytes(bytes, ContentType.parse(info.contentType))
}

internal fun Route.adminEnergyRoutes(repository: OnboardingRepository) {
    route("/api/admin/energy") {
        get {
            if (call.adminActor() == null) return@get
            val currentYear = LocalDate.now(ZoneOffset.UTC).year
            val year = call.request.queryParameters["year"]?.toIntOrNull() ?: currentYear
            if (year !in 2020..2030) {
                call.respond(HttpStatusCode.BadRequest, ApiError("year må være mellom 2020 og 2030"))
                return@get
            }
            call.respond(repository.getEnergySummaries(year, currentYear))
        }

        put("/{agreementId}/commitment") {
            if (call.adminActor() == null) return@put
            val input = try {
                call.receive<EnergyCommitmentInput>()
            } catch (e: Exception) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Ugyldig forpliktelse"))
                return@put
            }
            try {
                repository.setEnergyCommitment(call.parameters["agreementId"]!!, input, Instant.now())
                call.respond(HttpStatusCode.NoContent)
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Ugyldig forpliktelse"))
            }
        }

        get("/evidence/{id}") {
            if (call.adminActor() == null) return@get
            call.respondEvidence(repository.getEnergyEvidenceFile(call.parameters["id"]!!, supplierId = null))
        }
    }
}

internal fun Route.supplierEnergyEvidenceRoutes(repository: OnboardingRepository) {
    // The supplier's own agreements with the promised kWh and how delivery compares, so the promise is visible to the one who made it.
    get("/api/onboarding/energy/summary") {
        val user = call.supplierOrAdminUser(repository) ?: return@get
        val supplierId = call.resolveSupplierId(user) ?: return@get
        val currentYear = LocalDate.now(ZoneOffset.UTC).year
        val year = call.request.queryParameters["year"]?.toIntOrNull() ?: currentYear
        if (year !in 2020..2030) {
            call.respond(HttpStatusCode.BadRequest, ApiError("year må være mellom 2020 og 2030"))
            return@get
        }
        call.respond(repository.getEnergySummaries(year, currentYear).filter { it.supplierId == supplierId })
    }

    route("/api/onboarding/energy/evidence") {
        get {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respond(repository.getSupplierEnergyEvidence(supplierId))
        }

        get("/{id}") {
            val user = call.supplierOrAdminUser(repository) ?: return@get
            val supplierId = call.resolveSupplierId(user) ?: return@get
            call.respondEvidence(repository.getEnergyEvidenceFile(call.parameters["id"]!!, supplierId))
        }

        delete("/{id}") {
            val user = call.supplierOrAdminUser(repository) ?: return@delete
            val supplierId = call.resolveSupplierId(user) ?: return@delete
            if (repository.deleteEnergyEvidence(call.parameters["id"]!!, supplierId)) call.respond(HttpStatusCode.NoContent)
            else call.respond(HttpStatusCode.NotFound, ApiError("Fant ikke dokumentasjonsfilen"))
        }

        post {
            val user = call.supplierOrAdminUser(repository) ?: return@post
            val supplierId = call.resolveSupplierId(user) ?: return@post
            val fields = mutableMapOf<String, String>()
            var fileName: String? = null
            var bytes: ByteArray? = null
            var tooLarge = false
            call.receiveMultipart().forEachPart { part ->
                when (part) {
                    is PartData.FormItem -> fields[part.name.orEmpty()] = part.value
                    is PartData.FileItem -> if (part.name == "file") {
                        fileName = part.originalFileName
                        // Read one byte past the cap so an oversized file is detected without buffering all of it.
                        val read = part.provider().readRemaining((MAX_ENERGY_EVIDENCE_BYTES + 1).toLong()).readBytes()
                        if (read.size > MAX_ENERGY_EVIDENCE_BYTES) tooLarge = true else bytes = read
                    }
                    else -> Unit
                }
                part.release()
            }
            if (tooLarge) {
                call.respond(HttpStatusCode.PayloadTooLarge, ApiError("Filen er større enn ${MAX_ENERGY_EVIDENCE_BYTES / 1024 / 1024} MB"))
                return@post
            }
            val upload = bytes
            val name = fileName?.substringAfterLast('/')?.substringAfterLast('\\')?.takeIf { it.isNotBlank() }
            if (upload == null || upload.isEmpty() || name == null) {
                call.respond(HttpStatusCode.BadRequest, ApiError("Attach a file"))
                return@post
            }
            val contentType = EVIDENCE_TYPES[name.substringAfterLast('.', "").lowercase(Locale.ROOT)]
            if (contentType == null) {
                call.respond(HttpStatusCode.UnsupportedMediaType, ApiError("Tillatte filtyper: PDF, PNG, JPG, CSV, XLSX"))
                return@post
            }
            val year = fields["year"]?.toIntOrNull()
            val quarter = fields["quarter"]?.toIntOrNull()
            val agreementId = fields["agreementId"]?.trim()
            if (year == null || quarter == null || agreementId.isNullOrEmpty()) {
                call.respond(HttpStatusCode.BadRequest, ApiError("agreementId, year og quarter er påkrevd"))
                return@post
            }
            try {
                call.respond(HttpStatusCode.Created, repository.addEnergyEvidence(supplierId, agreementId, year, quarter, name, contentType, upload, Instant.now()))
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Ugyldig opplasting av dokumentasjon"))
            }
        }.apply {
            install(RequestBodyLimit) {
                bodyLimit { MAX_ENERGY_EVIDENCE_BYTES + 64L * 1024 }
            }
        }
    }
}
