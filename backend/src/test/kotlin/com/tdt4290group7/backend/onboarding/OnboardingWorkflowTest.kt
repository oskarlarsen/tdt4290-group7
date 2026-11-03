package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.supplierClient
import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.certificates.CertificateStatus
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.charset.StandardCharsets
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class OnboardingWorkflowTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun testRepository(): VehicleRepository =
        VehicleRepository(Path.of("build", "test-data", "onboarding-test-${UUID.randomUUID()}.db"))

    private fun setupSupplierAndAgreement(repo: VehicleRepository): String {
        val now = Instant.now()
        val actor = ChangeActor("admin-seed", "Advisor Hansen")
        repo.database.write { db ->
            repo.database.insert(
                db,
                "suppliers",
                mapOf(
                    "id" to "nordvik-transport",
                    "name" to "Nordvik Transport AS",
                    "org_number" to "987654321",
                    "updated_at" to now.toString(),
                    "active" to 1
                )
            )
        }
        val agreement = repo.fleet.saveAgreement(
            null,
            AgreementInput("nordvik-transport", "2026-01-01", "2027-12-31", 10, "Nordvik School Bus Agreement"),
            null,
            actor,
            now
        )
        return agreement.id
    }

    @Test
    fun completeSupplierOnboardingLifecycle() = testApplication {
        val repo = testRepository()
        val certificates = CertificateRepository(Path.of("build", "test-data", "onboarding-certs-${UUID.randomUUID()}.db"))
        application { module(repository = repo, registry = null, certificateRepository = certificates) }

        val agreementId = setupSupplierAndAgreement(repo)
        val supplier = supplierClient("nordvik-transport")
        val admin = adminClient()

        // 1. Initial status query
        val statusRes1 = supplier.get("/api/onboarding/status")
        assertEquals(HttpStatusCode.OK, statusRes1.status)
        val statusObj1 = json.parseToJsonElement(statusRes1.bodyAsText()).jsonObject
        assertEquals("INVITED", statusObj1["status"]?.jsonPrimitive?.content)
        assertFalse(statusObj1["canSubmit"]?.jsonPrimitive?.boolean ?: true)

        // 2. Update contact profile
        val profileRes = supplier.post("/api/onboarding/profile") {
            contentType(ContentType.Application.Json)
            setBody("""{"contactName":"Ola Nordmann","contactEmail":"miljo@nordvik.no","contactPhone":"+4791234567"}""")
        }
        assertEquals(HttpStatusCode.OK, profileRes.status)
        val profileObj = json.parseToJsonElement(profileRes.bodyAsText()).jsonObject
        assertEquals("DATA_DRAFT", profileObj["status"]?.jsonPrimitive?.content)
        assertEquals("Ola Nordmann", profileObj["contactName"]?.jsonPrimitive?.content)

        val prematureSubmit = supplier.post("/api/onboarding/submit")
        assertEquals(HttpStatusCode.BadRequest, prematureSubmit.status)

        // 3. Download CSV template
        val templateRes = supplier.get("/api/onboarding/templates/vehicles")
        assertEquals(HttpStatusCode.OK, templateRes.status)
        val templateText = templateRes.bodyAsText()
        assertTrue(templateText.endsWith(CsvStreamParser.VEHICLE_HEADERS.joinToString(";") + "\r\n"))
        assertFalse(templateText.contains(agreementId))

        // 4. Two-Phase CSV Upload: Preview valid fleet
        val validCsv = """
            agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes
            $agreementId,SV12345,FALSE,13,FALSE,TRUE,,,ORD-001,Biogas bus
            $agreementId,,TRUE,5,FALSE,FALSE,2026-W30,2027-W52,ORD-002,Planned electric bus
        """.trimIndent()

        val previewRes = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/upload/vehicles/preview",
            formData = formData {
                append("file", validCsv.toByteArray(StandardCharsets.UTF_8), Headers.build {
                    append(HttpHeaders.ContentType, "text/csv")
                    append(HttpHeaders.ContentDisposition, "filename=\"vehicles.csv\"")
                })
            }
        )
        assertEquals(HttpStatusCode.OK, previewRes.status)
        val previewObj = json.parseToJsonElement(previewRes.bodyAsText()).jsonObject
        assertTrue(previewObj["canCommit"]?.jsonPrimitive?.boolean ?: false)
        assertEquals(2, previewObj["totalRows"]?.jsonPrimitive?.content?.toInt())
        val batchId = previewObj["batchId"]?.jsonPrimitive?.content ?: error("Missing batchId")

        // 5. Confirm batch commit
        val confirmRes = supplier.post("/api/onboarding/upload/vehicles/confirm") {
            contentType(ContentType.Application.Json)
            setBody("""{"batchId":"$batchId"}""")
        }
        assertEquals(HttpStatusCode.OK, confirmRes.status)

        // 6. Verify vehicles are listed in supplier dashboard
        val vehiclesRes = supplier.get("/api/supplier/vehicles")
        assertEquals(HttpStatusCode.OK, vehiclesRes.status)
        val vehiclesArr = json.parseToJsonElement(vehiclesRes.bodyAsText()).jsonArray
        assertEquals(2, vehiclesArr.size)
        val importedVehicle = vehiclesArr.map { it.jsonObject }.first { it["registrationNumber"]?.jsonPrimitive?.content == "SV12345" }
        assertEquals("13", importedVehicle["fuelTechnology"]?.jsonPrimitive?.content)
        assertFalse(importedVehicle["isHybrid"]?.jsonPrimitive?.boolean ?: true)
        assertTrue(importedVehicle["fullContractCoverage"]?.jsonPrimitive?.boolean ?: false)
        assertEquals("ORD-001", importedVehicle["attachmentReference"]?.jsonPrimitive?.content)

        // 7. Check overview
        val overviewRes = supplier.get("/api/supplier/overview")
        assertEquals(HttpStatusCode.OK, overviewRes.status)
        val overviewObj = json.parseToJsonElement(overviewRes.bodyAsText()).jsonObject
        assertEquals(2, overviewObj["totalVehicles"]?.jsonPrimitive?.content?.toInt())

        // 8. Submission requires an agreement-linked certificate.
        val statusWithoutCertificate = supplier.get("/api/onboarding/status")
        assertFalse(json.parseToJsonElement(statusWithoutCertificate.bodyAsText()).jsonObject["canSubmit"]?.jsonPrimitive?.boolean ?: true)
        val submitWithoutCertificate = supplier.post("/api/onboarding/submit")
        assertEquals(HttpStatusCode.BadRequest, submitWithoutCertificate.status)
        certificates.add(
            Certificate(
                id = "cert-onboarding-test",
                supplierName = "Nordvik Transport AS",
                certificateType = "ISO 14001",
                issueDate = null,
                expiryDate = LocalDate.now().plusYears(1),
                sourceFile = "iso-14001.pdf",
                status = CertificateStatus.VALID,
                contractId = agreementId
            )
        )
        val statusWithCertificate = supplier.get("/api/onboarding/status")
        assertTrue(json.parseToJsonElement(statusWithCertificate.bodyAsText()).jsonObject["canSubmit"]?.jsonPrimitive?.boolean ?: false)

        // 9. Submit onboarding
        val submitRes = supplier.post("/api/onboarding/submit")
        assertEquals(HttpStatusCode.OK, submitRes.status)
        val submitObj = json.parseToJsonElement(submitRes.bodyAsText()).jsonObject
        assertEquals("SUBMITTED", submitObj["status"]?.jsonPrimitive?.content)
        val lockedProfileRes = supplier.post("/api/onboarding/profile") {
            contentType(ContentType.Application.Json)
            setBody("""{"contactName":"Updated Contact","contactEmail":"updated@nordvik.no"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, lockedProfileRes.status)

        // 10. Administrator reviews and approves
        val reviewRes = admin.post("/api/admin/onboarding/nordvik-transport/review") {
            contentType(ContentType.Application.Json)
            setBody("""{"action":"APPROVE","notes":"All documents and fleet requirements verified"}""")
        }
        assertEquals(HttpStatusCode.OK, reviewRes.status)
        val reviewObj = json.parseToJsonElement(reviewRes.bodyAsText()).jsonObject
        assertEquals("APPROVED", reviewObj["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun enforcesTenantIsolationForCsvUploads() = testApplication {
        val repo = testRepository()
        application { module(repo, null) }

        setupSupplierAndAgreement(repo)
        val supplier = supplierClient("nordvik-transport")

        // Attempt to upload records belonging to another supplier's agreement
        val foreignCsv = """
            agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes
            AGR-FOREIGN-99,SV99999,FALSE,13,FALSE,TRUE,,,ORD-99,Unauthorized
        """.trimIndent()

        val previewRes = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/upload/vehicles/preview",
            formData = formData {
                append("file", foreignCsv.toByteArray(StandardCharsets.UTF_8), Headers.build {
                    append(HttpHeaders.ContentType, "text/csv")
                    append(HttpHeaders.ContentDisposition, "filename=\"foreign.csv\"")
                })
            }
        )
        assertEquals(HttpStatusCode.OK, previewRes.status)
        val previewObj = json.parseToJsonElement(previewRes.bodyAsText()).jsonObject
        assertFalse(previewObj["canCommit"]?.jsonPrimitive?.boolean ?: true)
        val errors = previewObj["errors"]?.jsonArray
        assertTrue(errors != null && errors.size > 0)
        assertTrue(errors[0].jsonObject["message"]?.jsonPrimitive?.content?.contains("does not belong to your organization") ?: false)
    }

    @Test
    fun refusesToReassignAnotherSuppliersVehicleDuringImport() = testApplication {
        val repo = testRepository()
        application { module(repo, null) }
        val ownAgreementId = setupSupplierAndAgreement(repo)
        val now = Instant.now()
        val actor = ChangeActor("admin-seed", "Advisor Hansen")
        val otherSupplier = repo.fleet.saveSupplier(
            null,
            SupplierInput("Other Transport AS", "123456789"),
            actor,
            now
        )
        val otherAgreement = repo.fleet.saveAgreement(
            null,
            AgreementInput(otherSupplier.id, "2026-01-01", "2027-12-31", 10, "Other agreement"),
            null,
            actor,
            now
        )
        repo.database.write { db ->
            repo.database.insert(
                db,
                "vehicles",
                mapOf(
                    "registration_number" to "AB12345",
                    "agreement_id" to otherAgreement.id,
                    "planned" to 0,
                    "listed" to 1,
                    "created_at" to now.toString(),
                    "updated_at" to now.toString()
                )
            )
        }

        val supplier = supplierClient("nordvik-transport")
        val csv = """
            agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes
            $ownAgreementId,AB12345,FALSE,13,FALSE,TRUE,,,ORD-001,Attempted reassignment
        """.trimIndent()
        val preview = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/upload/vehicles/preview",
            formData = formData {
                append("file", csv.toByteArray(StandardCharsets.UTF_8), Headers.build {
                    append(HttpHeaders.ContentType, "text/csv")
                    append(HttpHeaders.ContentDisposition, "filename=\"vehicles.csv\"")
                })
            }
        )
        assertEquals(HttpStatusCode.OK, preview.status)
        val batchId = json.parseToJsonElement(preview.bodyAsText()).jsonObject["batchId"]!!.jsonPrimitive.content
        val confirmed = supplier.post("/api/onboarding/upload/vehicles/confirm") {
            contentType(ContentType.Application.Json)
            setBody("""{"batchId":"$batchId"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, confirmed.status)
        assertEquals(otherAgreement.id, repo.fleet.overview().vehicles.single().agreementId)
    }
}
