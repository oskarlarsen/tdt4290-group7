package com.tdt4290group7.backend

import com.tdt4290group7.backend.admin.AdminInsightsRepository
import com.tdt4290group7.backend.certificates.Certificate
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.certificates.CertificateStatus
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleEntryInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AdminDashboardRoutesTest {
    @Test
    fun persistedDashboardAndAlertWorkflowAreRestrictedToAdministrators() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val certificateRepository = CertificateRepository(databasePath("certificates"))
        val insightsPath = databasePath("insights")
        val insights = AdminInsightsRepository(insightsPath)
        val actor = ChangeActor("admin", "Administrator")
        val supplier = vehicles.fleet.saveSupplier(
            null,
            SupplierInput("Dashboard Transport AS", "123456789"),
            actor,
            Instant.now(),
        )
        val agreement = vehicles.fleet.saveAgreement(
            null,
            AgreementInput(supplier.id, "2026-01-01", "2027-12-31", 2, "Municipal transport", saksnr = "2024/1234"),
            null,
            actor,
            Instant.now(),
        )
        vehicles.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), actor, Instant.now())
        val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
        certificateRepository.add(
            Certificate(
                "expired-certificate",
                supplier.name,
                "ISO 14001",
                null,
                today.minusDays(1),
                "expired.pdf",
                CertificateStatus.EXPIRED,
                agreement.id,
            ),
        )
        certificateRepository.add(
            Certificate(
                "expiring-certificate",
                supplier.name,
                "Miljøfyrtårn",
                null,
                today.plusDays(30),
                "expiring.pdf",
                CertificateStatus.EXPIRES_30D,
                agreement.id,
            ),
        )
        application {
            module(vehicles, null, certificateRepository = certificateRepository, adminInsightsRepository = insights)
        }

        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/admin/dashboard/summary").status)
        assertEquals(HttpStatusCode.Forbidden, supplierClient(supplier.id).get("/api/admin/dashboard/summary").status)

        val admin = adminClient()
        assertEquals(HttpStatusCode.Forbidden, supplierClient(supplier.id).get("/api/admin/supplier-reviews").status)
        assertEquals(HttpStatusCode.OK, admin.put("/api/admin/supplier-reviews/${supplier.id}") {
            contentType(ContentType.Application.Json)
            setBody("""{"status":"resolved"}""")
        }.status)
        val reviewStatuses = Json.parseToJsonElement(admin.get("/api/admin/supplier-reviews").bodyAsText()).jsonObject
        assertEquals("resolved", reviewStatuses.getValue(supplier.id).jsonPrimitive.content)
        assertEquals("resolved", AdminInsightsRepository(insightsPath).supplierReviewStatuses()[supplier.id])

        val response = admin.get("/api/admin/dashboard/summary")
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        val kpis = body.getValue("kpis").jsonObject
        assertEquals(1, kpis.getValue("totalSuppliers").jsonPrimitive.int)
        assertEquals(1, kpis.getValue("activeAgreements").jsonPrimitive.int)
        assertEquals(1, kpis.getValue("listedVehicles").jsonPrimitive.int)
        assertEquals(2, kpis.getValue("certificatesTracked").jsonPrimitive.int)
        assertEquals(1, kpis.getValue("expiredCertificates").jsonPrimitive.int)
        assertEquals(1, kpis.getValue("certificatesExpiringWithin90Days").jsonPrimitive.int)
        assertEquals(2, kpis.getValue("activeAlerts").jsonPrimitive.int)
        assertEquals(1, body.getValue("riskClassification").jsonObject.getValue("high").jsonObject.getValue("count").jsonPrimitive.int)
        val classification = body.getValue("riskClassification").jsonObject
        // The four risk rows cover every active supplier, including those not assessed.
        assertEquals(
            kpis.getValue("totalSuppliers").jsonPrimitive.int,
            listOf("high", "medium", "compliant", "unassessed").sumOf { classification.getValue(it).jsonObject.getValue("count").jsonPrimitive.int },
        )
        assertEquals(100, classification.getValue("high").jsonObject.getValue("percent").jsonPrimitive.int)
        assertEquals(0, classification.getValue("unassessed").jsonObject.getValue("count").jsonPrimitive.int)
        val listedSupplier = body.getValue("topRiskSuppliers").jsonArray.single().jsonObject
        assertEquals("2024/1234 — Municipal transport", listedSupplier.getValue("primaryContract").jsonPrimitive.content)
        assertEquals(listOf("CERTIFICATE_EXPIRY"), listedSupplier.getValue("issueCategories").jsonArray.map { it.jsonPrimitive.content })
        assertEquals(1, body.getValue("suppliersRequiringAttention").jsonArray.size)

        val createResponse = admin.post("/api/admin/alerts") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"title":"Manual review","supplierId":"${supplier.id}","category":"VEHICLE_COMPLIANCE","severity":"medium","findingType":"CONFIRMED_DEVIATION","description":"Review the latest vehicle evidence."}""",
            )
        }
        assertEquals(HttpStatusCode.Created, createResponse.status, createResponse.bodyAsText())
        val createdId = Json.parseToJsonElement(createResponse.bodyAsText()).jsonObject
            .getValue("id").jsonPrimitive.content
        assertEquals(3, admin.get("/api/admin/alerts").bodyAsText().let {
            Json.parseToJsonElement(it).jsonArray.size
        })

        assertEquals(HttpStatusCode.OK, admin.patch("/api/admin/alerts/$createdId") {
            contentType(ContentType.Application.Json)
            setBody("""{"status":"RESOLVED"}""")
        }.status)
        val refreshedSummary = Json.parseToJsonElement(admin.get("/api/admin/dashboard/summary").bodyAsText()).jsonObject
        assertEquals(2, refreshedSummary.getValue("kpis").jsonObject.getValue("activeAlerts").jsonPrimitive.int)

        assertEquals(HttpStatusCode.NoContent, admin.delete("/api/admin/alerts/$createdId").status)
        assertEquals(2, Json.parseToJsonElement(admin.get("/api/admin/alerts").bodyAsText()).jsonArray.size)
        assertTrue(AdminInsightsRepository(insightsPath).allAlerts().isNotEmpty())
    }

    @Test
    fun supplierNotesAreAdminOnlyAndSelfNotesBelongToTheirAuthor() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val insights = AdminInsightsRepository(databasePath("insights"))
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Notes Transport AS", "123456789"), ChangeActor("admin", "Administrator"), Instant.now())
        application { module(vehicles, null, adminInsightsRepository = insights) }
        val admin = adminClient()

        suspend fun post(body: String) = admin.post("/api/admin/suppliers/${supplier.id}/notes") {
            contentType(ContentType.Application.Json); setBody(body)
        }
        // Visibility defaults to SELF, and the author comes from the login, not the request.
        val self = post("""{"text":"  Remember to call  "}""")
        assertEquals(HttpStatusCode.Created, self.status, self.bodyAsText())
        val selfNote = Json.parseToJsonElement(self.bodyAsText()).jsonObject
        assertEquals("SELF", selfNote.getValue("visibility").jsonPrimitive.content)
        assertEquals("Remember to call", selfNote.getValue("text").jsonPrimitive.content)
        assertEquals("Advisor Hansen", selfNote.getValue("authorName").jsonPrimitive.content)
        assertEquals(HttpStatusCode.Created, post("""{"text":"Shared with admins","visibility":"INTERNAL","alertId":"alert-1"}""").status)

        val listed = Json.parseToJsonElement(admin.get("/api/admin/suppliers/${supplier.id}/notes").bodyAsText()).jsonArray
        assertEquals(listOf("Shared with admins", "Remember to call"), listed.map { it.jsonObject.getValue("text").jsonPrimitive.content })
        assertEquals("alert-1", listed.first().jsonObject.getValue("alertId").jsonPrimitive.content)

        // Validation and unknown suppliers.
        assertEquals(HttpStatusCode.BadRequest, post("""{"text":"   "}""").status)
        assertEquals(HttpStatusCode.BadRequest, post("""{"text":"${"x".repeat(2001)}"}""").status)
        assertEquals(HttpStatusCode.BadRequest, post("""{"text":"hi","visibility":"SUPPLIER"}""").status)
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/admin/suppliers/unknown/notes") {
            contentType(ContentType.Application.Json); setBody("""{"text":"hi"}""")
        }.status)

        // Suppliers can neither read nor write notes.
        val supplierUser = supplierClient(supplier.id)
        assertEquals(HttpStatusCode.Forbidden, supplierUser.get("/api/admin/suppliers/${supplier.id}/notes").status)
        assertEquals(HttpStatusCode.Forbidden, supplierUser.post("/api/admin/suppliers/${supplier.id}/notes") {
            contentType(ContentType.Application.Json); setBody("""{"text":"hi"}""")
        }.status)
    }

    @Test
    fun anotherAdminSeesInternalNotesButNotSelfNotes() {
        val insights = AdminInsightsRepository(databasePath("insights"))
        val now = Instant.now()
        insights.addNote("s1", "admin-a", "Admin A", "SELF", "private to A", null, now)
        insights.addNote("s1", "admin-a", "Admin A", "INTERNAL", "for all admins", null, now.plusSeconds(1))
        insights.addNote("s2", "admin-a", "Admin A", "INTERNAL", "other supplier", null, now.plusSeconds(2))

        assertEquals(listOf("for all admins", "private to A"), insights.notesFor("s1", "admin-a").map { it.text })
        assertEquals(listOf("for all admins"), insights.notesFor("s1", "admin-b").map { it.text })
    }

    private fun databasePath(name: String) = Path.of("build", "test-data", "dashboard-$name-${UUID.randomUUID()}.db")
}
