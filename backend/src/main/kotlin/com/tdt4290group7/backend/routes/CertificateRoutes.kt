package com.tdt4290group7.backend.routes

import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateParser
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.certificates.CertificateStatus
import com.tdt4290group7.backend.certificates.calculateStatus
import com.tdt4290group7.backend.pdf.extractTextWithOcr
import com.tdt4290group7.backend.plugins.AUTH_JWT
import com.tdt4290group7.backend.plugins.ApiError
import com.tdt4290group7.backend.vehicles.adminActor
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.auth.authenticate
import io.ktor.server.plugins.bodylimit.RequestBodyLimit
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.utils.io.jvm.javaio.toInputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.Serializable
import org.apache.pdfbox.Loader

private const val MAX_UPLOAD_BYTES = 8L * 1024 * 1024
private const val MAX_PDF_PAGES = 25
private val OSLO_ZONE: ZoneId = ZoneId.of("Europe/Oslo")

@Serializable
private data class CertificateResponse(
    val id: String,
    val supplierName: String,
    val certificateType: String,
    val issueDate: String?,
    val expiryDate: String?,
    val sourceFile: String,
    val status: CertificateStatus,
    val contractId: String?,
)

fun Application.configureCertificateRoutes(repository: CertificateRepository) {
    routing {
        authenticate(AUTH_JWT) {
            route("/api/certificates") {
                get {
                    if (call.adminActor() == null) return@get
                    val today = LocalDate.now(OSLO_ZONE)
                    val certificates = repository.getAll()
                        .map { it.copy(status = calculateStatus(it.expiryDate, today)) }
                        .sortedWith(compareBy<Certificate> { it.status.priority }.thenBy { it.expiryDate })
                        .map(Certificate::toResponse)
                    call.respond(certificates)
                }

                post {
                    if (call.adminActor() == null) return@post

                    val upload = try {
                        call.receiveCertificateUpload()
                    } catch (cause: IllegalArgumentException) {
                        call.respond(HttpStatusCode.BadRequest, ApiError(cause.message ?: "Invalid certificate upload"))
                        return@post
                    }

                    val tempFile = try {
                        Files.createTempFile("certificate-upload-", ".pdf")
                    } catch (_: IOException) {
                        call.respond(HttpStatusCode.InternalServerError, ApiError("Could not process certificate upload"))
                        return@post
                    }

                    try {
                        Files.write(tempFile, upload.pdf)
                        val pageCount = try {
                            Loader.loadPDF(tempFile.toFile()).use { it.numberOfPages }
                        } catch (_: IOException) {
                            call.respond(HttpStatusCode.BadRequest, ApiError("Certificate PDF could not be read"))
                            return@post
                        }
                        if (pageCount !in 1..MAX_PDF_PAGES) {
                            call.respond(
                                HttpStatusCode.BadRequest,
                                ApiError("Certificate PDF must contain between 1 and $MAX_PDF_PAGES pages"),
                            )
                            return@post
                        }

                        val text = try {
                            extractTextWithOcr(tempFile.toFile(), languages = "nor+eng", dpi = 300)
                        } catch (_: IllegalStateException) {
                            call.respond(
                                HttpStatusCode.ServiceUnavailable,
                                ApiError("Could not extract certificate text; check the local OCR setup"),
                            )
                            return@post
                        } catch (_: IOException) {
                            call.respond(HttpStatusCode.BadRequest, ApiError("Certificate PDF could not be read"))
                            return@post
                        }
                        if (text.isBlank()) {
                            call.respond(HttpStatusCode.UnprocessableEntity, ApiError("No readable text was found in the certificate"))
                            return@post
                        }

                        val parsed = CertificateParser.parse(text, upload.sourceFile)
                        val certificate = Certificate(
                            id = UUID.randomUUID().toString(),
                            supplierName = upload.supplierName,
                            certificateType = parsed.certificateType,
                            issueDate = parsed.issueDate,
                            expiryDate = parsed.expiryDate,
                            sourceFile = parsed.sourceFile,
                            status = calculateStatus(parsed.expiryDate, LocalDate.now(OSLO_ZONE)),
                            contractId = upload.contractId,
                        )
                        repository.add(certificate)
                        call.respond(HttpStatusCode.Created, certificate.toResponse())
                    } catch (_: IOException) {
                        call.respond(HttpStatusCode.InternalServerError, ApiError("Could not process certificate upload"))
                    } finally {
                        try {
                            Files.deleteIfExists(tempFile)
                        } catch (cause: IOException) {
                            call.application.log.error("certificate_temp_file_cleanup_failed", cause)
                        }
                    }
                }.apply {
                    install(RequestBodyLimit) {
                        bodyLimit { MAX_UPLOAD_BYTES }
                    }
                }
            }
        }
    }
}

private data class CertificateUpload(
    val supplierName: String,
    val sourceFile: String,
    val pdf: ByteArray,
    val contractId: String?,
)

private suspend fun io.ktor.server.application.ApplicationCall.receiveCertificateUpload(): CertificateUpload {
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
    val name = supplierName?.takeIf { it.isNotBlank() && it.length <= 200 }
        ?: throw IllegalArgumentException("Supplier name is required and must be at most 200 characters")
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

private fun Certificate.toResponse() = CertificateResponse(
    id = id,
    supplierName = supplierName,
    certificateType = certificateType,
    issueDate = issueDate?.toString(),
    expiryDate = expiryDate?.toString(),
    sourceFile = sourceFile,
    status = status,
    contractId = contractId,
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
