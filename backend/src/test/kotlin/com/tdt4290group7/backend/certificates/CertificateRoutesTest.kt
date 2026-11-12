package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.routes.SupplierUploadLimiter
import com.tdt4290group7.backend.supplierClient
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.delete
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class CertificateRoutesTest {
    @Test
    fun administratorCanUploadParseAndRetrieveCertificateMetadata() = testApplication {
        val certificateDatabase = databasePath()
        val vehicleRepository = VehicleRepository(databasePath())
        val actor = ChangeActor("admin", "Administrator")
        val supplier = vehicleRepository.fleet.saveSupplier(
            null,
            SupplierInput("Example Transport AS", "123456789"),
            actor,
            Instant.now(),
        )
        val agreement = vehicleRepository.fleet.saveAgreement(
            null,
            AgreementInput(supplier.id, "2026-01-01", "2028-12-31", 2, "Transport", saksnr = "2024/1234"),
            null,
            actor,
            Instant.now(),
        )
        application {
            module(
                vehicleRepository,
                null,
                Duration.ofDays(14),
                CertificateRepository(certificateDatabase),
            )
        }

        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/certificates").status)

        val adminClient = adminClient()
        val pdf = javaClass.classLoader
            .getResourceAsStream("test-pdf/test-certificate-iso14001.pdf")!!
            .use { it.readBytes() }
        val response = adminClient.post("/api/certificates") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append("supplierName", "Incorrect client value")
                        append("contractId", agreement.id)
                        append(
                            "file",
                            pdf,
                            Headers.build {
                                append(HttpHeaders.ContentType, "application/pdf")
                                append(HttpHeaders.ContentDisposition, """filename="iso-14001.pdf"""")
                            },
                        )
                    },
                ),
            )
        }

        assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
        val uploaded = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("Example Transport AS", uploaded.getValue("supplierName").jsonPrimitive.content)
        assertEquals("ISO 14001", uploaded.getValue("certificateType").jsonPrimitive.content)
        assertEquals(agreement.id, uploaded.getValue("contractId").jsonPrimitive.content)

        val invalidAgreementUpload = adminClient.post("/api/certificates") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append("supplierName", "Example Transport AS")
                        append("contractId", "not-an-active-agreement")
                        append(
                            "file",
                            pdf,
                            Headers.build {
                                append(HttpHeaders.ContentType, "application/pdf")
                                append(HttpHeaders.ContentDisposition, """filename="iso-14001.pdf"""")
                            },
                        )
                    },
                ),
            )
        }
        assertEquals(HttpStatusCode.BadRequest, invalidAgreementUpload.status)

        val listed = adminClient.get("/api/certificates")
        assertEquals(HttpStatusCode.OK, listed.status)
        val records = Json.parseToJsonElement(listed.bodyAsText()).jsonArray
        assertEquals(1, records.size)
        assertEquals(
            uploaded.getValue("id").jsonPrimitive.content,
            records.single().jsonObject.getValue("id").jsonPrimitive.content,
        )
        val certificateId = uploaded.getValue("id").jsonPrimitive.content
        val edited = adminClient.put("/api/certificates/$certificateId") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"supplierName":"Updated Transport AS","certificateType":"ISO 14001","issueDate":"2025-01-15","expiryDate":"2028-12-31","contractId":"${agreement.id}"}""",
            )
        }
        assertEquals(HttpStatusCode.OK, edited.status, edited.bodyAsText())
        val editedRecord = Json.parseToJsonElement(edited.bodyAsText()).jsonObject
        assertEquals("Example Transport AS", editedRecord.getValue("supplierName").jsonPrimitive.content)
        assertEquals("2025-01-15", editedRecord.getValue("issueDate").jsonPrimitive.content)
        assertEquals(agreement.id, editedRecord.getValue("contractId").jsonPrimitive.content)
        assertEquals("iso-14001.pdf", CertificateRepository(certificateDatabase).getById(certificateId)?.sourceFile)

        val invalidAgreementEdit = adminClient.put("/api/certificates/$certificateId") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"supplierName":"Updated Transport AS","certificateType":"ISO 14001","issueDate":"2025-01-15","expiryDate":"2028-12-31","contractId":"CONTRACT-42"}""",
            )
        }
        assertEquals(HttpStatusCode.BadRequest, invalidAgreementEdit.status)

        val invalidEdit = adminClient.put("/api/certificates/$certificateId") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"supplierName":"Updated Transport AS","certificateType":"ISO 14001","issueDate":"2029-01-01","expiryDate":"2028-12-31","contractId":"${agreement.id}"}""",
            )
        }
        assertEquals(HttpStatusCode.BadRequest, invalidEdit.status)

        // DELETE no longer destroys anything: the certificate is archived and stays in the database.
        assertEquals(HttpStatusCode.NoContent, adminClient.delete("/api/certificates/$certificateId").status)
        assertEquals(0, CertificateRepository(certificateDatabase).getAll().size)
        val archived = CertificateRepository(certificateDatabase).getAllIncludingArchived().single()
        assertEquals(certificateId, archived.id)
        assertNotNull(archived.archivedAt)
        assertEquals(HttpStatusCode.NotFound, adminClient.delete("/api/certificates/$certificateId").status, "already archived")
    }

    private suspend fun HttpClient.uploadPdf(path: String, contractId: String?, pdf: ByteArray) = post(path) {
        setBody(
            MultiPartFormDataContent(
                formData {
                    append("supplierName", "Ignored by the server when an agreement is chosen")
                    if (contractId != null) append("contractId", contractId)
                    append("file", pdf, Headers.build {
                        append(HttpHeaders.ContentType, "application/pdf")
                        append(HttpHeaders.ContentDisposition, """filename="iso-14001.pdf"""")
                    })
                },
            ),
        )
    }

    private val isoPdf by lazy { javaClass.classLoader.getResourceAsStream("test-pdf/test-certificate-iso14001.pdf")!!.use { it.readBytes() } }

    @Test
    fun supplierUploadsOnlyAgainstItsOwnAgreementsAndTheServerSetsTheSupplier() = testApplication {
        SupplierUploadLimiter.reset()
        val vehicles = VehicleRepository(databasePath())
        val actor = ChangeActor("admin", "Administrator")
        val mine = vehicles.fleet.saveSupplier(null, SupplierInput("My Transport AS", "123456789"), actor, Instant.now())
        val other = vehicles.fleet.saveSupplier(null, SupplierInput("Other Transport AS", "987654321"), actor, Instant.now())
        fun agreementFor(supplierId: String) = vehicles.fleet.saveAgreement(
            null, AgreementInput(supplierId, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now(),
        )
        val myAgreement = agreementFor(mine.id); val otherAgreement = agreementFor(other.id)
        val certificates = CertificateRepository(databasePath())
        application { module(vehicles, null, Duration.ofDays(14), certificates) }
        val supplier = supplierClient(mine.id)

        val ok = supplier.uploadPdf("/api/supplier/certificates", myAgreement.id, isoPdf)
        assertEquals(HttpStatusCode.Created, ok.status, ok.bodyAsText())
        val body = Json.parseToJsonElement(ok.bodyAsText()).jsonObject
        assertEquals("My Transport AS", body.getValue("supplierName").jsonPrimitive.content)
        assertEquals("SUPPLIER", body.getValue("uploadedByRole").jsonPrimitive.content)

        assertEquals(HttpStatusCode.Forbidden, supplier.uploadPdf("/api/supplier/certificates", otherAgreement.id, isoPdf).status)
        assertEquals(HttpStatusCode.BadRequest, supplier.uploadPdf("/api/supplier/certificates", null, isoPdf).status)
        assertEquals(HttpStatusCode.BadRequest, supplier.uploadPdf("/api/supplier/certificates", "no-such-agreement", isoPdf).status)
        assertEquals(1, certificates.getAll().size)
        // Admins use their own route; the supplier route is for suppliers only.
        assertEquals(HttpStatusCode.Forbidden, adminClient().uploadPdf("/api/supplier/certificates", myAgreement.id, isoPdf).status)
    }

    @Test
    fun aCertificateUploadCountsAsTheSuppliersLastUpdateAndStaysListedAfterTheAgreementEnds() = testApplication {
        SupplierUploadLimiter.reset()
        val vehicles = VehicleRepository(databasePath())
        val actor = ChangeActor("admin", "Administrator")
        val mine = vehicles.fleet.saveSupplier(null, SupplierInput("My Transport AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(
            null, AgreementInput(mine.id, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now(),
        )
        val certificates = CertificateRepository(databasePath())
        application { module(vehicles, null, Duration.ofDays(14), certificates) }
        val supplier = supplierClient(mine.id)

        assertEquals(HttpStatusCode.Created, supplier.uploadPdf("/api/supplier/certificates", agreement.id, isoPdf).status)
        val uploadedAt = certificates.getAll().single().uploadedAt
        assertNotNull(uploadedAt)

        val summary = Json.parseToJsonElement(adminClient().get("/api/admin/dashboard/summary").bodyAsText()).jsonObject
        val row = summary.getValue("topRiskSuppliers").jsonArray.map { it.jsonObject }.single { it.getValue("id").jsonPrimitive.content == mine.id }
        assertEquals(uploadedAt, row.getValue("lastUpdatedAt").jsonPrimitive.content)
        assertEquals("SUPPLIER", row.getValue("lastUpdatedBy").jsonPrimitive.content)

        // Once the agreement has ended, its certificates stay on the supplier's own list as history.
        val current = vehicles.fleet.overview().agreements.single { it.id == agreement.id }
        vehicles.fleet.removeAgreement(agreement.id, current.updatedAt, actor, Instant.now())
        val listed = Json.parseToJsonElement(supplier.get("/api/supplier/certificates").bodyAsText()).jsonArray
        assertEquals(1, listed.size)
    }

    @Test
    fun supplierUploadsAreRateLimitedPerSupplier() {
        SupplierUploadLimiter.reset()
        val now = Instant.now()
        repeat(SupplierUploadLimiter.MAX_PER_HOUR) { assertEquals(true, SupplierUploadLimiter.tryAcquire("s1", now)) }
        assertEquals(false, SupplierUploadLimiter.tryAcquire("s1", now))
        assertEquals(true, SupplierUploadLimiter.tryAcquire("s2", now))
        assertEquals(true, SupplierUploadLimiter.tryAcquire("s1", now.plusSeconds(3601)))
    }

    private fun renewalFixture(certificates: CertificateRepository, contractId: String, supplierName: String, type: String = "ISO 14001") {
        certificates.add(Certificate("old-cert", supplierName, type, null, java.time.LocalDate.of(2000, 1, 1), "old.pdf", CertificateStatus.EXPIRED, contractId, uploadedByRole = "ADMIN"))
    }

    @Test
    fun supplierRenewalWaitsForAnAdminAndAdminRenewalArchivesAtOnce() = testApplication {
        SupplierUploadLimiter.reset()
        val vehicles = VehicleRepository(databasePath())
        val actor = ChangeActor("admin", "Administrator")
        val mine = vehicles.fleet.saveSupplier(null, SupplierInput("My Transport AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(
            null, AgreementInput(mine.id, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now(),
        )
        val certificates = CertificateRepository(databasePath())
        renewalFixture(certificates, agreement.id, mine.name)
        application { module(vehicles, null, Duration.ofDays(14), certificates) }
        val supplier = supplierClient(mine.id)
        val admin = adminClient()
        suspend fun liveIds() = Json.parseToJsonElement(admin.get("/api/certificates").bodyAsText()).jsonArray
            .map { it.jsonObject.getValue("id").jsonPrimitive.content }.toSet()

        // The supplier's renewal is recorded as pending; the old certificate stays live.
        val renewal = Json.parseToJsonElement(supplier.uploadPdf("/api/supplier/certificates", agreement.id, isoPdf).bodyAsText()).jsonObject
        val renewalId = renewal.getValue("id").jsonPrimitive.content
        assertEquals("old-cert", renewal.getValue("archivePendingFor").jsonPrimitive.content)
        assertEquals(setOf("old-cert", renewalId), liveIds())

        // Reject keeps both and clears the mark; a second reject finds nothing.
        assertEquals(HttpStatusCode.NoContent, admin.post("/api/certificates/$renewalId/reject-archive").status)
        assertEquals(setOf("old-cert", renewalId), liveIds())
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/certificates/$renewalId/reject-archive").status)
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/certificates/$renewalId/confirm-archive").status)

        // A second supplier renewal, this time confirmed. The first renewal has the same expiry, so it is not
        // older than the new one and is not proposed for archive; the 2000 certificate still is.
        val again = Json.parseToJsonElement(supplier.uploadPdf("/api/supplier/certificates", agreement.id, isoPdf).bodyAsText()).jsonObject
        val againId = again.getValue("id").jsonPrimitive.content
        assertEquals("old-cert", again.getValue("archivePendingFor").jsonPrimitive.content)
        assertEquals(HttpStatusCode.Forbidden, supplier.post("/api/certificates/$againId/confirm-archive").status)
        assertEquals(HttpStatusCode.NoContent, admin.post("/api/certificates/$againId/confirm-archive").status)
        assertEquals(setOf(renewalId, againId), liveIds())
        assertEquals(listOf("old-cert"), certificates.getArchived().map { it.id })
        assertEquals(null, certificates.getById(againId)?.archivePendingFor)
    }

    @Test
    fun adminRenewalArchivesTheOlderCertificateImmediately() = testApplication {
        val vehicles = VehicleRepository(databasePath())
        val actor = ChangeActor("admin", "Administrator")
        val mine = vehicles.fleet.saveSupplier(null, SupplierInput("My Transport AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(
            null, AgreementInput(mine.id, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now(),
        )
        val certificates = CertificateRepository(databasePath())
        renewalFixture(certificates, agreement.id, mine.name)
        // A different type, a certificate with no agreement, and one on another agreement are never replaced.
        certificates.add(Certificate("other-type", mine.name, "Retura", null, java.time.LocalDate.of(2000, 1, 1), "r.pdf", CertificateStatus.EXPIRED, agreement.id))
        certificates.add(Certificate("no-agreement", mine.name, "ISO 14001", null, java.time.LocalDate.of(2000, 1, 1), "n.pdf", CertificateStatus.EXPIRED, null))
        application { module(vehicles, null, Duration.ofDays(14), certificates) }
        val admin = adminClient()

        val renewal = Json.parseToJsonElement(admin.uploadPdf("/api/certificates", agreement.id, isoPdf).bodyAsText()).jsonObject
        assertEquals("ADMIN", renewal.getValue("uploadedByRole").jsonPrimitive.content)
        assertEquals(setOf("other-type", "no-agreement", renewal.getValue("id").jsonPrimitive.content), certificates.getAll().map { it.id }.toSet())
        assertEquals(listOf("old-cert"), certificates.getArchived().map { it.id })
    }

    @Test
    fun certificateTypesMatchOnTheirNormalisedForm() {
        assertEquals(true, CertificateTypes.sameType("ISO 14001", "iso-14001"))
        assertEquals(true, CertificateTypes.sameType("Miljøfyrtårn", "miljofyrtarn"))
        assertEquals(true, CertificateTypes.sameType("Retura", " retura "))
        assertEquals(false, CertificateTypes.sameType("Retura", "Grønt Punkt Norge"))
        assertEquals(false, CertificateTypes.sameType("Unknown", "Unknown"))
        assertEquals(false, CertificateTypes.sameType("", ""))
    }

    private fun databasePath() = Path.of("build", "test-data", "certificate-${UUID.randomUUID()}.db")
}
