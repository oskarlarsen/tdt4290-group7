package com.tdt4290group7.backend.routes

import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateParser
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.certificates.CertificateStatus
import com.tdt4290group7.backend.certificates.CertificateTypes
import com.tdt4290group7.backend.certificates.calculateStatus
import com.tdt4290group7.backend.pdf.extractTextWithOcr
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.plugins.AUTH_JWT
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.plugins.ApiError
import com.tdt4290group7.backend.vehicles.adminActor
import com.tdt4290group7.backend.vehicles.FleetRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.ContentTransformationException
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.utils.io.jvm.javaio.toInputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.Serializable
import org.apache.pdfbox.Loader

private const val MAX_UPLOAD_BYTES = 8L * 1024 * 1024
private const val MAX_PDF_PAGES = 25
private val OSLO_ZONE: ZoneId = ZoneId.of("Europe/Oslo")

@Serializable
internal data class CertificateResponse(
    val id: String,
    val supplierName: String,
    val certificateType: String,
    val issueDate: String?,
    val expiryDate: String?,
    val sourceFile: String,
    val status: CertificateStatus,
    val contractId: String?,
    val archivedAt: String? = null,
    val uploadedByRole: String? = null,
    val archivePendingFor: String? = null,
)

@Serializable
private data class UpdateCertificateRequest(
    val supplierName: String,
    val certificateType: String,
    val issueDate: String? = null,
    val expiryDate: String? = null,
    val contractId: String? = null,
)

fun Application.configureCertificateRoutes(repository: CertificateRepository, fleet: FleetRepository? = null) {
    routing {
        authenticate(AUTH_JWT) {
            route("/api/certificates") {
                get {
                    if (call.adminActor() == null) return@get
                    val today = LocalDate.now(OSLO_ZONE)
                    val certificates = (if (call.request.queryParameters["includeArchived"] == "true") repository.getAllIncludingArchived() else repository.getAll())
                        .map { it.copy(status = calculateStatus(it.expiryDate, today)) }
                        .sortedWith(compareBy<Certificate> { it.status.priority }.thenBy { it.expiryDate })
                        .map(Certificate::toResponse)
                    call.respond(certificates)
                }

                put("/{id}") {
                    if (call.adminActor() == null) return@put
                    val id = call.parameters["id"]
                    val existing = id?.let(repository::getById)
                    if (existing == null) {
                        call.respond(HttpStatusCode.NotFound, ApiError("Certificate not found"))
                        return@put
                    }

                    val request = try {
                        call.receive<UpdateCertificateRequest>()
                    } catch (_: ContentTransformationException) {
                        call.respond(HttpStatusCode.BadRequest, ApiError("Invalid certificate details"))
                        return@put
                    }

                    val requestedSupplierName = request.supplierName.trim()
                    val certificateType = request.certificateType.trim()
                    val contractId = request.contractId?.trim()?.ifEmpty { null }
                    if (requestedSupplierName.isEmpty() || requestedSupplierName.length > 200 ||
                        certificateType.isEmpty() || certificateType.length > 200 ||
                        (contractId != null && contractId.length > 200)
                    ) {
                        call.respond(HttpStatusCode.BadRequest, ApiError("Invalid certificate details"))
                        return@put
                    }
                    val supplierName = if (contractId == null) {
                        requestedSupplierName
                    } else {
                        fleet?.activeAgreementEvidence(contractId)?.supplier?.name ?: run {
                            call.respond(HttpStatusCode.BadRequest, ApiError("Select an active supplier agreement"))
                            return@put
                        }
                    }

                    val issueDate = request.issueDate.toLocalDateOrNull()
                    val expiryDate = request.expiryDate.toLocalDateOrNull()
                    if ((request.issueDate != null && issueDate == null) ||
                        (request.expiryDate != null && expiryDate == null) ||
                        (issueDate != null && expiryDate != null && issueDate.isAfter(expiryDate))
                    ) {
                        call.respond(HttpStatusCode.BadRequest, ApiError("Certificate dates are invalid"))
                        return@put
                    }

                    val updated = existing.copy(
                        supplierName = supplierName,
                        certificateType = certificateType,
                        issueDate = issueDate,
                        expiryDate = expiryDate,
                        contractId = contractId,
                        status = calculateStatus(expiryDate, LocalDate.now(OSLO_ZONE)),
                    )
                    if (!repository.update(updated)) {
                        call.respond(HttpStatusCode.NotFound, ApiError("Certificate not found"))
                        return@put
                    }
                    call.respond(updated.toResponse())
                }

                post("/{id}/archive") {
                    val actor = call.adminActor() ?: return@post
                    val id = call.parameters["id"]
                    if (id == null || !repository.archive(id, actor.id, java.time.Instant.now())) {
                        call.respond(HttpStatusCode.NotFound, ApiError("Certificate not found or already archived"))
                        return@post
                    }
                    call.application.log.info("certificate_archived certificateId={} actorId={}", id, actor.id)
                    call.respond(HttpStatusCode.NoContent)
                }

                post("/{id}/restore") {
                    val actor = call.adminActor() ?: return@post
                    val id = call.parameters["id"]
                    if (id == null || !repository.restore(id)) {
                        call.respond(HttpStatusCode.NotFound, ApiError("Certificate not found or not archived"))
                        return@post
                    }
                    call.application.log.info("certificate_restored certificateId={} actorId={}", id, actor.id)
                    call.respond(HttpStatusCode.NoContent)
                }

                // An admin decides on a supplier's renewal: confirm archives the older certificate, reject keeps it.
                post("/{id}/confirm-archive") {
                    val actor = call.adminActor() ?: return@post
                    val renewal = call.parameters["id"]?.let(repository::getById)?.takeIf { it.archivePendingFor != null }
                    if (renewal == null) {
                        call.respond(HttpStatusCode.NotFound, ApiError("No pending renewal found"))
                        return@post
                    }
                    repository.archive(renewal.archivePendingFor!!, actor.id, Instant.now(), replacedBy = renewal.id)
                    repository.clearPendingArchive(renewal.id)
                    call.application.log.info("certificate_archive_confirmed renewalId={} oldId={} actorId={}", renewal.id, renewal.archivePendingFor, actor.id)
                    call.respond(HttpStatusCode.NoContent)
                }

                post("/{id}/reject-archive") {
                    val actor = call.adminActor() ?: return@post
                    val id = call.parameters["id"]
                    if (id == null || !repository.clearPendingArchive(id)) {
                        call.respond(HttpStatusCode.NotFound, ApiError("No pending renewal found"))
                        return@post
                    }
                    call.application.log.info("certificate_archive_rejected renewalId={} actorId={}", id, actor.id)
                    call.respond(HttpStatusCode.NoContent)
                }

                delete("/{id}") {
                    if (call.adminActor() == null) return@delete
                    val id = call.parameters["id"]
                    if (id == null || !repository.delete(id)) {
                        call.respond(HttpStatusCode.NotFound, ApiError("Certificate not found"))
                        return@delete
                    }
                    call.respond(HttpStatusCode.NoContent)
                }

                post {
                    val actor = call.adminActor() ?: return@post
                    call.handleCertificateUpload(repository, fleet, Uploader("ADMIN", actor.id, null))
                }.apply {
                    install(RequestBodyLimit) {
                        bodyLimit { MAX_UPLOAD_BYTES }
                    }
                }
            }

            // Suppliers upload their own certificates, only against their own active agreements.
            post("/api/supplier/certificates") {
                val user = call.principal<JWTPrincipal>()?.payload?.let(JwtConfig::userId)?.let(UserRepository::findById)
                if (user?.role != Role.SUPPLIER || user.supplierId == null) {
                    call.respond(HttpStatusCode.Forbidden, ApiError("Supplier access required"))
                    return@post
                }
                if (!SupplierUploadLimiter.tryAcquire(user.supplierId)) {
                    call.respond(HttpStatusCode.TooManyRequests, ApiError("Too many certificate uploads. Try again later."))
                    return@post
                }
                call.handleCertificateUpload(repository, fleet, Uploader("SUPPLIER", user.id, user.supplierId))
            }.apply {
                install(RequestBodyLimit) {
                    bodyLimit { MAX_UPLOAD_BYTES }
                }
            }
        }
    }
}


/** OCR at 300 dpi is expensive, so each supplier gets a small hourly allowance of uploads. */
internal object SupplierUploadLimiter {
    const val MAX_PER_HOUR = 10
    private val recent = java.util.concurrent.ConcurrentHashMap<String, java.util.ArrayDeque<Instant>>()

    fun tryAcquire(supplierId: String, now: Instant = Instant.now()): Boolean {
        val times = recent.computeIfAbsent(supplierId) { java.util.ArrayDeque() }
        synchronized(times) {
            while (times.isNotEmpty() && times.first().isBefore(now.minusSeconds(3600))) times.removeFirst()
            if (times.size >= MAX_PER_HOUR) return false
            times.addLast(now)
            return true
        }
    }

    fun reset() = recent.clear()
}

private data class Uploader(val role: String, val actorId: String, val supplierId: String?)

/** The live certificate a new upload would replace: same agreement, same type, and an earlier expiry date. */
private fun findRenewedCertificate(repository: CertificateRepository, uploaded: Certificate): Certificate? {
    val expiry = uploaded.expiryDate ?: return null
    val contractId = uploaded.contractId ?: return null
    return repository.getAll().filter {
        it.id != uploaded.id && it.contractId == contractId && CertificateTypes.sameType(it.certificateType, uploaded.certificateType) &&
            it.expiryDate != null && it.expiryDate.isBefore(expiry)
    }.maxByOrNull { it.expiryDate!! }
}

private suspend fun ApplicationCall.handleCertificateUpload(repository: CertificateRepository, fleet: FleetRepository?, uploader: Uploader) {
    val upload = try {
        receiveCertificateUpload(requireSupplierName = uploader.supplierId == null)
    } catch (cause: IllegalArgumentException) {
        respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid certificate upload"))
        return
    }
    val evidence = upload.contractId?.let { fleet?.activeAgreementEvidence(it) }
    if (uploader.supplierId != null) {
        // A supplier may only upload against its own active agreements; the supplier name comes from the agreement.
        if (upload.contractId == null || evidence == null) {
            respond(HttpStatusCode.BadRequest, ApiError("Select one of your active agreements"))
            return
        }
        if (evidence.supplier.id != uploader.supplierId) {
            respond(HttpStatusCode.Forbidden, ApiError("That agreement belongs to another supplier"))
            return
        }
    } else if (upload.contractId != null && evidence == null) {
        respond(HttpStatusCode.BadRequest, ApiError("Select an active supplier agreement"))
        return
    }
    val supplierName = evidence?.supplier?.name ?: upload.supplierName

    val tempFile = try {
        Files.createTempFile("certificate-upload-", ".pdf")
    } catch (_: IOException) {
        respond(HttpStatusCode.InternalServerError, ApiError("Could not process certificate upload"))
        return
    }

    try {
        Files.write(tempFile, upload.pdf)
        val pageCount = try {
            Loader.loadPDF(tempFile.toFile()).use { it.numberOfPages }
        } catch (_: IOException) {
            respond(HttpStatusCode.BadRequest, ApiError("Certificate PDF could not be read"))
            return
        }
        if (pageCount !in 1..MAX_PDF_PAGES) {
            respond(
                HttpStatusCode.BadRequest,
                ApiError("Certificate PDF must contain between 1 and $MAX_PDF_PAGES pages"),
            )
            return
        }

        val text = try {
            extractTextWithOcr(tempFile.toFile(), languages = "nor+eng", dpi = 300)
        } catch (_: IllegalStateException) {
            respond(
                HttpStatusCode.ServiceUnavailable,
                ApiError("Could not extract certificate text; check the local OCR setup"),
            )
            return
        } catch (_: IOException) {
            respond(HttpStatusCode.BadRequest, ApiError("Certificate PDF could not be read"))
            return
        }
        if (text.isBlank()) {
            respond(HttpStatusCode.UnprocessableEntity, ApiError("No readable text was found in the certificate"))
            return
        }

        val parsed = CertificateParser.parse(text, upload.sourceFile)
        val certificate = Certificate(
            id = UUID.randomUUID().toString(),
            supplierName = supplierName,
            certificateType = parsed.certificateType,
            issueDate = parsed.issueDate,
            expiryDate = parsed.expiryDate,
            sourceFile = parsed.sourceFile,
            status = calculateStatus(parsed.expiryDate, LocalDate.now(OSLO_ZONE)),
            contractId = upload.contractId,
            uploadedByRole = uploader.role,
        )
        val renewed = findRenewedCertificate(repository, certificate)
        // A supplier's renewal only proposes the archive: the date is read by OCR from a file the supplier chose,
        // so an admin confirms before the older certificate stops raising alerts.
        val toRepository = if (renewed != null && uploader.role == "SUPPLIER") certificate.copy(archivePendingFor = renewed.id) else certificate
        repository.add(toRepository)
        if (renewed != null && uploader.role == "ADMIN") repository.archive(renewed.id, uploader.actorId, Instant.now(), replacedBy = certificate.id)
        respond(HttpStatusCode.Created, toRepository.toResponse())
    } catch (_: IOException) {
        respond(HttpStatusCode.InternalServerError, ApiError("Could not process certificate upload"))
    } finally {
        try {
            Files.deleteIfExists(tempFile)
        } catch (cause: IOException) {
            application.log.error("certificate_temp_file_cleanup_failed", cause)
        }
    }
}

private fun String?.toLocalDateOrNull(): LocalDate? {
    if (this == null) return null
    return try {
        LocalDate.parse(this)
    } catch (_: DateTimeException) {
        null
    }
}

private data class CertificateUpload(
    val supplierName: String,
    val sourceFile: String,
    val pdf: ByteArray,
    val contractId: String?,
)

private suspend fun io.ktor.server.application.ApplicationCall.receiveCertificateUpload(requireSupplierName: Boolean = true): CertificateUpload {
    var supplierName: String? = null
    var sourceFile: String? = null
    var pdf: ByteArray? = null
    var contractId: String? = null
    var contractIdSeen = false
    var validationError: String? = null

    receiveMultipart().forEachPart { part ->
        try {
            when (part) {
                is PartData.FormItem -> if (part.name == "supplierName") {
                    if (supplierName != null) validationError = "Supplier name must be provided once"
                    supplierName = part.value.trim()
                } else if (part.name == "contractId") {
                    if (contractIdSeen) validationError = "Contract ID must be provided once"
                    contractIdSeen = true
                    contractId = part.value.trim().takeIf { it.isNotEmpty() }
                }
                is PartData.FileItem -> if (part.name == "file") {
                    if (pdf != null) {
                        validationError = "Upload one PDF file at a time"
                    } else {
                        val filename = part.originalFileName
                            ?.substringAfterLast('/')
                            ?.substringAfterLast('\\')
                            ?.trim()
                        if (filename.isNullOrBlank() || !filename.endsWith(".pdf", ignoreCase = true)) {
                            validationError = "Upload a PDF file"
                        } else {
                            sourceFile = filename.take(255)
                            pdf = part.provider().toInputStream().use { it.readBytes() }
                        }
                    }
                }
                else -> Unit
            }
        } finally {
            part.release()
        }
    }

    validationError?.let { throw IllegalArgumentException(it) }
    // A supplier's upload takes the name from its own agreement, so the field is optional there.
    val name = supplierName?.takeIf { it.isNotBlank() && it.length <= 200 }
        ?: if (requireSupplierName) throw IllegalArgumentException("Supplier name is required and must be at most 200 characters") else ""
    val selectedContractId = contractId
    if (selectedContractId != null && selectedContractId.length > 200) {
        throw IllegalArgumentException("Contract ID must be at most 200 characters")
    }
    val filename = sourceFile ?: throw IllegalArgumentException("Certificate PDF is required")
    val bytes = pdf?.takeIf { it.isNotEmpty() } ?: throw IllegalArgumentException("Certificate PDF is empty")
    val header = bytes.copyOfRange(0, minOf(bytes.size, 1024)).toString(Charsets.ISO_8859_1)
    if (!header.contains("%PDF-")) throw IllegalArgumentException("Uploaded file is not a valid PDF")
    return CertificateUpload(name, filename, bytes, selectedContractId)
}

internal fun Certificate.toResponse() = CertificateResponse(
    id = id,
    supplierName = supplierName,
    certificateType = certificateType,
    issueDate = issueDate?.toString(),
    expiryDate = expiryDate?.toString(),
    sourceFile = sourceFile,
    status = status,
    contractId = contractId,
    archivedAt = archivedAt,
    uploadedByRole = uploadedByRole,
    archivePendingFor = archivePendingFor,
)

private val CertificateStatus.priority: Int
    get() = when (this) {
        CertificateStatus.EXPIRED -> 0
        CertificateStatus.MISSING_DOCUMENTATION -> 1
        CertificateStatus.EXPIRES_30D -> 2
        CertificateStatus.EXPIRES_90D -> 3
        CertificateStatus.EXPIRES_180D -> 4
        CertificateStatus.VALID -> 5
    }
