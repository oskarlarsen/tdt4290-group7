package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.supplierClient
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.repository.UserRepository
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
            AgreementInput("nordvik-transport", "2026-01-01", "2027-12-31", 10, "Nordvik School Bus Agreement", saksnr = "2024/1234"),
            null,
            actor,
            now
        )
        return agreement.id
    }

    @Test
    fun completeSupplierOnboardingLifecycle() = testApplication {
        val repo = testRepository()
        application { module(repository = repo, registry = null) }

        val agreementId = setupSupplierAndAgreement(repo)
        val registeredAccountsBefore = UserRepository.supplierAccountCounts()["nordvik-transport"] ?: 0
        val supplier = supplierClient("nordvik-transport")
        val registeredAccountsAfterAcceptance = UserRepository.supplierAccountCounts()["nordvik-transport"] ?: 0
        assertEquals(registeredAccountsBefore + 1, registeredAccountsAfterAcceptance)
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
        assertTrue(templateText.endsWith(CsvStreamParser.VEHICLE_TEMPLATE_HEADERS.joinToString(";") + "\r\n"))
        assertFalse(templateText.contains("is_hybrid"))
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

        val adminSummaryRes = admin.get("/api/admin/dashboard/summary")
        assertEquals(HttpStatusCode.OK, adminSummaryRes.status)
        val supplierSummary = json.parseToJsonElement(adminSummaryRes.bodyAsText())
            .jsonObject["topRiskSuppliers"]!!.jsonArray
            .map { it.jsonObject }
            .single { it["id"]?.jsonPrimitive?.content == "nordvik-transport" }
        assertEquals("Ola Nordmann", supplierSummary["contactName"]?.jsonPrimitive?.content)
        assertEquals("miljo@nordvik.no", supplierSummary["contactEmail"]?.jsonPrimitive?.content)
        assertEquals("DATA_DRAFT", supplierSummary["onboardingStatus"]?.jsonPrimitive?.content)
        assertEquals(2, supplierSummary["vehicleCount"]?.jsonPrimitive?.content?.toInt())
        assertEquals(1, supplierSummary["agreementCount"]?.jsonPrimitive?.content?.toInt())
        assertEquals(
            registeredAccountsAfterAcceptance,
            supplierSummary["registeredAccountCount"]?.jsonPrimitive?.content?.toInt()
        )

        // Submission only requires the information types assigned to the agreement.
        val statusWithRequestedVehicleData = supplier.get("/api/onboarding/status")
        assertTrue(json.parseToJsonElement(statusWithRequestedVehicleData.bodyAsText()).jsonObject["canSubmit"]?.jsonPrimitive?.boolean ?: false)

        val submitRes = supplier.post("/api/onboarding/submit")
        assertEquals(HttpStatusCode.OK, submitRes.status)
        val submitObj = json.parseToJsonElement(submitRes.bodyAsText()).jsonObject
        assertEquals("SUBMITTED", submitObj["status"]?.jsonPrimitive?.content)

        val lockedProfileRes = supplier.post("/api/onboarding/profile") {
            contentType(ContentType.Application.Json)
            setBody("""{"contactName":"Updated Contact","contactEmail":"updated@nordvik.no"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, lockedProfileRes.status)

        val adminReviewRes = admin.post("/api/admin/onboarding/nordvik-transport/review") {
            contentType(ContentType.Application.Json)
            setBody("""{"action":"REQUEST_CHANGES","notes":"Please update the contact details."}""")
        }
        assertEquals(HttpStatusCode.OK, adminReviewRes.status)
        val supplierReviewStatus = supplier.get("/api/onboarding/status")
        assertEquals(
            "REVISION_REQUIRED",
            json.parseToJsonElement(supplierReviewStatus.bodyAsText()).jsonObject["status"]?.jsonPrimitive?.content
        )
        assertEquals(
            "Please update the contact details.",
            json.parseToJsonElement(supplierReviewStatus.bodyAsText()).jsonObject["reviewerNotes"]?.jsonPrimitive?.content
        )
        val revisedProfileRes = supplier.post("/api/onboarding/profile") {
            contentType(ContentType.Application.Json)
            setBody("""{"contactName":"Updated Contact","contactEmail":"updated@nordvik.no"}""")
        }
        assertEquals(HttpStatusCode.OK, revisedProfileRes.status)
        val resubmitRes = supplier.post("/api/onboarding/submit")
        assertEquals(HttpStatusCode.OK, resubmitRes.status)
        assertEquals(
            "SUBMITTED",
            json.parseToJsonElement(resubmitRes.bodyAsText()).jsonObject["status"]?.jsonPrimitive?.content
        )

        // Administrator reviews and approves
        val reviewRes = admin.post("/api/admin/onboarding/nordvik-transport/review") {
            contentType(ContentType.Application.Json)
            setBody("""{"action":"APPROVE","notes":"All documents and fleet requirements verified"}""")
        }
        assertEquals(HttpStatusCode.OK, reviewRes.status)
        val reviewObj = json.parseToJsonElement(reviewRes.bodyAsText()).jsonObject
        assertEquals("APPROVED", reviewObj["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun supplierCanOnlyAccessInformationTypesRequestedByTheirAgreements() = testApplication {
        val repo = testRepository()
        application { module(repo, null) }
        setupSupplierAndAgreement(repo)
        repo.fleet.saveAgreement(
            null,
            AgreementInput(
                supplierId = "nordvik-transport",
                startDate = "2026-01-01",
                endDate = "2027-12-31",
                allowedVehicles = 0,
                note = "Energy reporting",
                requiresVehicles = false,
                requiresEnergy = true,
                requiresProducts = false,
                saksnr = "2024/1234"
            ),
            null,
            ChangeActor("admin-seed", "Advisor Hansen"),
            Instant.now()
        )
        val supplier = supplierClient("nordvik-transport")

        val status = json.parseToJsonElement(supplier.get("/api/onboarding/status").bodyAsText()).jsonObject
        val requiredEntities = status["requiredEntities"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet()
        assertEquals(setOf("VEHICLES", "ENERGY"), requiredEntities)
        assertEquals(HttpStatusCode.OK, supplier.get("/api/onboarding/templates/energy").status)
        assertEquals(HttpStatusCode.OK, supplier.get("/api/onboarding/templates/vehicles").status)
        assertEquals(HttpStatusCode.Forbidden, supplier.get("/api/onboarding/templates/products").status)

        val unrequestedProductsCsv = "not,a,valid,template"
        val preview = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/upload/products/preview",
            formData = formData {
                append("file", unrequestedProductsCsv.toByteArray(StandardCharsets.UTF_8), Headers.build {
                    append(HttpHeaders.ContentType, "text/csv")
                    append(HttpHeaders.ContentDisposition, "filename=\"products.csv\"")
                })
            }
        )
        assertEquals(HttpStatusCode.BadRequest, preview.status)
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
    fun importsATruckAnotherSupplierAlreadyUsesAsAListingOfItsOwn() = testApplication {
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
            AgreementInput(otherSupplier.id, "2026-01-01", "2027-12-31", 10, "Other agreement", saksnr = "2024/1234"),
            null,
            actor,
            now
        )
        repo.database.write { db ->
            repo.fleet.ensureTruck(db, "AB12345", false, now)
            repo.database.insert(
                db,
                "vehicle_usages",
                mapOf(
                    "id" to "AB12345|${otherAgreement.id}",
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
            $ownAgreementId,AB12345,FALSE,13,FALSE,TRUE,,,ORD-001,Shared truck
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
        assertEquals(HttpStatusCode.OK, confirmed.status, confirmed.bodyAsText())
        // Both suppliers list the same truck, each under its own agreement; the first one's listing is untouched.
        val listings = repo.fleet.overview().vehicles.filter { it.registrationNumber == "AB12345" }
        assertEquals(setOf(ownAgreementId, otherAgreement.id), listings.map { it.agreementId }.toSet())
        assertTrue(listings.all { it.listed })
        // Contract details belong to the supplier's own listing only.
        val detailRows = repo.database.read { db -> repo.database.query(db, "SELECT usage_id, notes FROM vehicle_usage_details") { it.getString(1) to it.getString(2) } }
        assertEquals(listOf("AB12345|$ownAgreementId" to "Shared truck"), detailRows)
    }

    @Test
    fun completeEnergyAndProductOnboardingFlow() = testApplication {
        val repo = testRepository()
        application { module(repo, null) }
        val now = Instant.now()
        val actor = ChangeActor("admin-seed", "Advisor Hansen")

        repo.database.write { db ->
            repo.database.insert(
                db,
                "suppliers",
                mapOf(
                    "id" to "eco-facility",
                    "name" to "EcoFacility AS",
                    "org_number" to "998877665",
                    "updated_at" to now.toString(),
                    "active" to 1
                )
            )
        }

        val energyAgreement = repo.fleet.saveAgreement(
            null,
            AgreementInput(
                supplierId = "eco-facility",
                startDate = "2026-01-01",
                endDate = "2027-12-31",
                allowedVehicles = 0,
                note = "Energy Services Agreement",
                requiresVehicles = false,
                requiresEnergy = true,
                requiresProducts = false,
                saksnr = "2024/1234"
            ),
            null,
            actor,
            now
        )

        val productAgreement = repo.fleet.saveAgreement(
            null,
            AgreementInput(
                supplierId = "eco-facility",
                startDate = "2026-01-01",
                endDate = "2027-12-31",
                allowedVehicles = 0,
                note = "Sustainable Goods Agreement",
                requiresVehicles = false,
                requiresEnergy = false,
                requiresProducts = true,
                saksnr = "2024/1234"
            ),
            null,
            actor,
            now
        )

        val supplier = supplierClient("eco-facility")
        val admin = adminClient()

        // 1. Submit energy data
        val energyCsv = """
            agreement_id,facility_location_code,facility_address,storage_area_sqm,workshop_area_sqm,other_area_sqm,reporting_year,electricity_kwh,district_heating_kwh,biogas_kwh,fossil_fuel_kwh,self_produced_solar_kwh,self_produced_heatpump_kwh,notes
            ${energyAgreement.id},DEPOT-TRD-01,Kongens gate 1 7011 Trondheim,500,250,50,2026,15000,25000,1000,0,3500,0,Main facility
        """.trimIndent()

        val energyPreviewRes = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/upload/energy/preview",
            formData = formData {
                append("file", energyCsv.toByteArray(StandardCharsets.UTF_8), Headers.build {
                    append(HttpHeaders.ContentType, "text/csv")
                    append(HttpHeaders.ContentDisposition, "filename=\"energy.csv\"")
                })
            }
        )
        assertEquals(HttpStatusCode.OK, energyPreviewRes.status)
        val energyPreviewObj = json.parseToJsonElement(energyPreviewRes.bodyAsText()).jsonObject
        assertTrue(energyPreviewObj["canCommit"]?.jsonPrimitive?.boolean ?: false)
        val energyBatchId = energyPreviewObj["batchId"]!!.jsonPrimitive.content

        val energyConfirmRes = supplier.post("/api/onboarding/upload/energy/confirm") {
            contentType(ContentType.Application.Json)
            setBody("""{"batchId":"$energyBatchId"}""")
        }
        assertEquals(HttpStatusCode.OK, energyConfirmRes.status)

        // 2. Submit products data
        val productCsv = """
            agreement_id,product_code,product_name,product_category,ecolabel_standard,license_number,unit_of_measure,is_repaired_or_reused,notes
            ${productAgreement.id},FURN-001,Office Desk,FURNITURE,NORDIC_SWAN,5001-0012,PCS,FALSE,Pine desk
            ${productAgreement.id},FURN-002,Refurbished Chair,FURNITURE,NONE,,PCS,TRUE,Circular chair
        """.trimIndent()

        val productPreviewRes = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/upload/products/preview",
            formData = formData {
                append("file", productCsv.toByteArray(StandardCharsets.UTF_8), Headers.build {
                    append(HttpHeaders.ContentType, "text/csv")
                    append(HttpHeaders.ContentDisposition, "filename=\"products.csv\"")
                })
            }
        )
        assertEquals(HttpStatusCode.OK, productPreviewRes.status)
        val productPreviewObj = json.parseToJsonElement(productPreviewRes.bodyAsText()).jsonObject
        assertTrue(productPreviewObj["canCommit"]?.jsonPrimitive?.boolean ?: false)
        val productBatchId = productPreviewObj["batchId"]!!.jsonPrimitive.content

        val productConfirmRes = supplier.post("/api/onboarding/upload/products/confirm") {
            contentType(ContentType.Application.Json)
            setBody("""{"batchId":"$productBatchId"}""")
        }
        assertEquals(HttpStatusCode.OK, productConfirmRes.status)

        // 3. Verify supplier endpoints return the data
        val energyRes = supplier.get("/api/supplier/energy")
        assertEquals(HttpStatusCode.OK, energyRes.status)
        val energyList = json.parseToJsonElement(energyRes.bodyAsText()).jsonArray
        assertEquals(1, energyList.size)
        assertEquals("DEPOT-TRD-01", energyList[0].jsonObject["locationCode"]?.jsonPrimitive?.content)

        val productsRes = supplier.get("/api/supplier/products")
        assertEquals(HttpStatusCode.OK, productsRes.status)
        val productsList = json.parseToJsonElement(productsRes.bodyAsText()).jsonArray
        assertEquals(2, productsList.size)

        // 4. Verify admin dashboard summary counts
        val adminSummaryRes = admin.get("/api/admin/dashboard/summary")
        assertEquals(HttpStatusCode.OK, adminSummaryRes.status)
        val summarySupplier = json.parseToJsonElement(adminSummaryRes.bodyAsText())
            .jsonObject["topRiskSuppliers"]!!.jsonArray
            .map { it.jsonObject }
            .single { it["id"]?.jsonPrimitive?.content == "eco-facility" }

        assertEquals(1, summarySupplier["energyRecordCount"]?.jsonPrimitive?.content?.toInt())
        assertEquals(2, summarySupplier["productCount"]?.jsonPrimitive?.content?.toInt())
        assertEquals(2, summarySupplier["agreementCount"]?.jsonPrimitive?.content?.toInt())

        // 5. Verify admin can query the supplier's energy and products via query param
        val adminEnergyRes = admin.get("/api/supplier/energy?supplierId=eco-facility")
        assertEquals(HttpStatusCode.OK, adminEnergyRes.status)
        val adminEnergyList = json.parseToJsonElement(adminEnergyRes.bodyAsText()).jsonArray
        assertEquals(1, adminEnergyList.size)

        val adminProductsRes = admin.get("/api/supplier/products?supplierId=eco-facility")
        assertEquals(HttpStatusCode.OK, adminProductsRes.status)
        val adminProductsList = json.parseToJsonElement(adminProductsRes.bodyAsText()).jsonArray
        assertEquals(2, adminProductsList.size)
    }

    private fun previewVehicle(repo: VehicleRepository, agreementId: String, plate: String, at: Instant): String {
        val csv = "agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes\n" +
            "$agreementId,$plate,FALSE,13,FALSE,TRUE,,,ORD-1,"
        val preview = repo.onboarding.createBatchPreview("nordvik-transport", BatchEntityType.VEHICLES, "v.csv", csv.toByteArray(), at)
        assertTrue(preview.canCommit, preview.errors.toString())
        return preview.batchId
    }

    @Test
    fun expiredPreviewCannotBeConfirmed() {
        val repo = testRepository()
        val agreementId = setupSupplierAndAgreement(repo)
        val start = Instant.parse("2026-01-01T10:00:00Z")
        val batchId = previewVehicle(repo, agreementId, "AB12301", start)

        val failure = kotlin.runCatching {
            repo.onboarding.confirmBatch(batchId, "nordvik-transport", start.plusSeconds(16 * 60))
        }.exceptionOrNull()
        assertTrue(failure is IllegalArgumentException && failure.message!!.contains("expired"), failure.toString())
    }

    @Test
    fun keepsOnlyFivePendingPreviewsPerSupplier() {
        val repo = testRepository()
        val agreementId = setupSupplierAndAgreement(repo)
        val start = Instant.parse("2026-01-01T10:00:00Z")
        val ids = (1..6).map { previewVehicle(repo, agreementId, "AB1230$it", start.plusSeconds(it.toLong())) }

        val oldest = kotlin.runCatching {
            repo.onboarding.confirmBatch(ids.first(), "nordvik-transport", start.plusSeconds(10))
        }.exceptionOrNull()
        assertTrue(oldest is IllegalArgumentException, "oldest preview should have been evicted")
        repo.onboarding.confirmBatch(ids.last(), "nordvik-transport", start.plusSeconds(10))
    }

    @Test
    fun lastUpdatedIsTheLatestChangeAndSaysWhoMadeIt() {
        val repo = testRepository()
        val agreementId = setupSupplierAndAgreement(repo)
        val start = Instant.now().plusSeconds(600)
        // The agreement was created by an admin: that is the only change so far.
        assertEquals("ADMIN", repo.onboarding.lastUpdatedBySupplier().getValue("nordvik-transport").by)

        val upload = previewVehicle(repo, agreementId, "AB12401", start)
        repo.onboarding.confirmBatch(upload, "nordvik-transport", start.plusSeconds(60), byRole = "SUPPLIER")
        val afterUpload = repo.onboarding.lastUpdatedBySupplier().getValue("nordvik-transport")
        assertEquals("SUPPLIER", afterUpload.by)
        assertEquals(start.plusSeconds(60).truncatedTo(java.time.temporal.ChronoUnit.MILLIS), afterUpload.at.truncatedTo(java.time.temporal.ChronoUnit.MILLIS))

        // A later admin change takes over; an upload with no recorded role is attributed to nobody.
        repo.fleet.addVehicle(agreementId, com.tdt4290group7.backend.vehicles.VehicleEntryInput(planned = true), ChangeActor("admin", "Admin"), start.plusSeconds(3600))
        assertEquals("ADMIN", repo.onboarding.lastUpdatedBySupplier().getValue("nordvik-transport").by)
    }
}
