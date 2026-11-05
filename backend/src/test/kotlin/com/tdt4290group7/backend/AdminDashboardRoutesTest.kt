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

    private fun databasePath(name: String) = Path.of("build", "test-data", "dashboard-$name-${UUID.randomUUID()}.db")
}
