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
    fun longLeadCertificatesGetALowAlertAYearAheadAndOthersDoNot() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val certificateRepository = CertificateRepository(databasePath("certificates"))
        val insights = AdminInsightsRepository(databasePath("insights"))
        val actor = ChangeActor("admin", "Administrator")
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Renewal Transport AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(
            null, AgreementInput(supplier.id, "2026-01-01", "2030-12-31", 2, "Transport", saksnr = "2024/1"), null, actor, Instant.now(),
        )
        val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
        fun certificate(id: String, type: String, daysLeft: Long) = Certificate(
            id, supplier.name, type, null, today.plusDays(daysLeft), "$id.pdf", CertificateStatus.VALID, agreement.id,
        )
        certificateRepository.add(certificate("iso-far", "ISO 14001", 200))
        certificateRepository.add(certificate("miljo-edge", "Miljøfyrtårn", 365))
        certificateRepository.add(certificate("miljo-too-far", "Miljøfyrtårn", 366))
        certificateRepository.add(certificate("retura-200", "Retura", 200))
        certificateRepository.add(certificate("iso-soon", "ISO 14001", 60))
        application { module(vehicles, null, certificateRepository = certificateRepository, adminInsightsRepository = insights) }
        val admin = adminClient()

        val alerts = Json.parseToJsonElement(admin.get("/api/admin/alerts").bodyAsText()).jsonArray.map { it.jsonObject }
        val bySeverity = alerts.groupBy { it.getValue("severity").jsonPrimitive.content }
        // 200 and 365 days left: low. 60 days left: medium. 366 days, and a type that is not long lead at 200 days: none.
        assertEquals(2, bySeverity.getValue("low").size)
        assertEquals(1, bySeverity.getValue("medium").size)
        assertEquals(3, alerts.size)
        assertTrue(alerts.filter { it.getValue("severity").jsonPrimitive.content == "low" }.all { it.getValue("category").jsonPrimitive.content == "CERTIFICATES" })

        val summary = Json.parseToJsonElement(admin.get("/api/admin/dashboard/summary").bodyAsText()).jsonObject
        val kpis = summary.getValue("kpis").jsonObject
        assertEquals(3, kpis.getValue("activeAlerts").jsonPrimitive.int)
        val counts = kpis.getValue("alertsBySeverity").jsonObject
        assertEquals(listOf(0, 1, 2), listOf("high", "medium", "low").map { counts.getValue(it).jsonPrimitive.int })
        // Low alerts are early warnings: they do not make a supplier medium or high risk.
        assertEquals("medium", summary.getValue("topRiskSuppliers").jsonArray.single().jsonObject.getValue("risk").jsonPrimitive.content)
    }

    @Test
    fun archivedAlertsLeaveTheListAndCanBeRestoredButDeletedOnesCannot() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val insights = AdminInsightsRepository(databasePath("insights"))
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Archive AS", "123456789"), ChangeActor("admin", "Administrator"), Instant.now())
        application { module(vehicles, null, adminInsightsRepository = insights) }
        val admin = adminClient()
        suspend fun create(title: String) = Json.parseToJsonElement(admin.post("/api/admin/alerts") {
            contentType(ContentType.Application.Json)
            setBody("""{"title":"$title","supplierId":"${supplier.id}","category":"VEHICLE_COMPLIANCE","severity":"medium","findingType":"CONFIRMED_DEVIATION","description":"d"}""")
        }.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        suspend fun titles(query: String = "") = Json.parseToJsonElement(admin.get("/api/admin/alerts$query").bodyAsText()).jsonArray
            .map { it.jsonObject.getValue("title").jsonPrimitive.content }
        val kept = create("Kept"); val archived = create("Archived"); val deleted = create("Deleted")

        assertEquals(HttpStatusCode.NoContent, admin.post("/api/admin/alerts/$archived/archive").status)
        assertEquals(HttpStatusCode.NoContent, admin.delete("/api/admin/alerts/$deleted").status)
        assertEquals(listOf("Kept"), titles())
        assertEquals(setOf("Kept", "Archived"), titles("?includeArchived=true").toSet())
        val archivedRow = Json.parseToJsonElement(admin.get("/api/admin/alerts?includeArchived=true").bodyAsText()).jsonArray
            .map { it.jsonObject }.single { it.getValue("title").jsonPrimitive.content == "Archived" }
        assertTrue(archivedRow["archivedAt"]!!.jsonPrimitive.content.isNotEmpty())
        // Archived alerts no longer count as unresolved.
        assertEquals(1, Json.parseToJsonElement(admin.get("/api/admin/dashboard/summary").bodyAsText()).jsonObject
            .getValue("kpis").jsonObject.getValue("activeAlerts").jsonPrimitive.int)

        assertEquals(HttpStatusCode.NotFound, admin.post("/api/admin/alerts/$archived/archive").status)
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/admin/alerts/$deleted/restore").status)
        assertEquals(HttpStatusCode.NoContent, admin.post("/api/admin/alerts/$archived/restore").status)
        assertEquals(setOf("Kept", "Archived"), titles().toSet())
        assertEquals(HttpStatusCode.Forbidden, supplierClient(supplier.id).post("/api/admin/alerts/$kept/archive").status)
    }

    @Test
    fun archivingACertificateClosesItsAlertAndRestoreReopensItUnlessAnAdminResolvedIt() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val certificateRepository = CertificateRepository(databasePath("certificates"))
        val insights = AdminInsightsRepository(databasePath("insights"))
        val actor = ChangeActor("admin", "Administrator")
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Cert AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(
            null, AgreementInput(supplier.id, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now(),
        )
        val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
        certificateRepository.add(Certificate("cert-1", supplier.name, "ISO 14001", null, today.plusDays(20), "a.pdf", CertificateStatus.EXPIRES_30D, agreement.id))
        application { module(vehicles, null, certificateRepository = certificateRepository, adminInsightsRepository = insights) }
        val admin = adminClient()
        suspend fun alert() = Json.parseToJsonElement(admin.get("/api/admin/alerts").bodyAsText()).jsonArray.map { it.jsonObject }.single()
        suspend fun certificates(query: String = "") = Json.parseToJsonElement(admin.get("/api/certificates$query").bodyAsText()).jsonArray.size
        assertEquals("OPEN", alert().getValue("status").jsonPrimitive.content)

        assertEquals(HttpStatusCode.NoContent, admin.post("/api/certificates/cert-1/archive").status)
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/certificates/cert-1/archive").status)
        assertEquals(0, certificates())
        assertEquals(1, certificates("?includeArchived=true"))
        assertEquals("RESOLVED", alert().getValue("status").jsonPrimitive.content)
        val kpis = Json.parseToJsonElement(admin.get("/api/admin/dashboard/summary").bodyAsText()).jsonObject.getValue("kpis").jsonObject
        assertEquals(0, kpis.getValue("certificatesTracked").jsonPrimitive.int)
        assertEquals(0, kpis.getValue("activeAlerts").jsonPrimitive.int)

        assertEquals(HttpStatusCode.NoContent, admin.post("/api/certificates/cert-1/restore").status)
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/certificates/cert-1/restore").status)
        assertEquals(1, certificates())
        assertEquals("OPEN", alert().getValue("status").jsonPrimitive.content)

        // An alert an admin resolved by hand stays resolved through an archive and restore.
        val alertId = alert().getValue("id").jsonPrimitive.content
        admin.patch("/api/admin/alerts/$alertId") { contentType(ContentType.Application.Json); setBody("""{"status":"RESOLVED"}""") }
        admin.post("/api/certificates/cert-1/archive"); alert()
        admin.post("/api/certificates/cert-1/restore")
        assertEquals("RESOLVED", alert().getValue("status").jsonPrimitive.content)
        assertEquals(HttpStatusCode.Forbidden, supplierClient(supplier.id).post("/api/certificates/cert-1/archive").status)
    }

    @Test
    fun adminCanEditManualAlertsButNotAutomaticOnes() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val certificateRepository = CertificateRepository(databasePath("certificates"))
        val insights = AdminInsightsRepository(databasePath("insights"))
        val actor = ChangeActor("admin", "Administrator")
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Edit AS", "123456789"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(null, AgreementInput(supplier.id, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now())
        certificateRepository.add(Certificate("c1", supplier.name, "Retura", null, LocalDate.now(ZoneId.of("Europe/Oslo")).plusDays(10), "c.pdf", CertificateStatus.EXPIRES_30D, agreement.id))
        application { module(vehicles, null, certificateRepository = certificateRepository, adminInsightsRepository = insights) }
        val admin = adminClient()
        val manualId = Json.parseToJsonElement(admin.post("/api/admin/alerts") {
            contentType(ContentType.Application.Json)
            setBody("""{"title":"Original","supplierId":"${supplier.id}","category":"VEHICLE_COMPLIANCE","severity":"medium","findingType":"CONFIRMED_DEVIATION","description":"Old text","dueDate":"2026-12-01"}""")
        }.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        suspend fun patch(id: String, body: String) = admin.patch("/api/admin/alerts/$id") { contentType(ContentType.Application.Json); setBody(body) }
        suspend fun alert(id: String) = Json.parseToJsonElement(admin.get("/api/admin/alerts").bodyAsText()).jsonArray.map { it.jsonObject }.single { it.getValue("id").jsonPrimitive.content == id }

        // Content edits keep what is not mentioned, and a status-only patch still works.
        val edited = patch(manualId, """{"title":"  Edited  ","severity":"high"}""")
        assertEquals(HttpStatusCode.OK, edited.status, edited.bodyAsText())
        val row = alert(manualId)
        assertEquals("Edited", row.getValue("title").jsonPrimitive.content)
        assertEquals("high", row.getValue("severity").jsonPrimitive.content)
        assertEquals("Old text", row.getValue("description").jsonPrimitive.content)
        assertEquals("2026-12-01", row.getValue("dueDate").jsonPrimitive.content)
        assertEquals(HttpStatusCode.OK, patch(manualId, """{"description":"New text","dueDate":"2027-01-15","status":"IN_PROGRESS"}""").status)
        assertEquals("IN_PROGRESS", alert(manualId).getValue("status").jsonPrimitive.content)
        assertEquals("2027-01-15", alert(manualId).getValue("dueDate").jsonPrimitive.content)
        assertEquals(HttpStatusCode.OK, patch(manualId, """{"dueDate":""}""").status)
        assertEquals(null, alert(manualId)["dueDate"]?.takeIf { it.toString() != "null" })
        assertEquals(HttpStatusCode.OK, patch(manualId, """{"status":"RESOLVED"}""").status)

        // Validation, and nothing at all to update.
        for (bad in listOf("""{"title":"  "}""", """{"title":"${"x".repeat(201)}"}""", """{"severity":"urgent"}""", """{"dueDate":"01/02/2027"}""", """{"status":"DONE"}""", "{}")) {
            assertEquals(HttpStatusCode.BadRequest, patch(manualId, bad).status, bad)
        }
        assertEquals(HttpStatusCode.NotFound, patch("missing", """{"title":"x"}""").status)

        // Automatic alerts are rebuilt from evidence, so their content cannot be edited, but their status can.
        val automaticId = Json.parseToJsonElement(admin.get("/api/admin/alerts").bodyAsText()).jsonArray.map { it.jsonObject }
            .single { it.getValue("source").jsonPrimitive.content == "AUTOMATIC" }.getValue("id").jsonPrimitive.content
        assertEquals(HttpStatusCode.Conflict, patch(automaticId, """{"title":"Mine"}""").status)
        assertEquals(HttpStatusCode.OK, patch(automaticId, """{"status":"UNDER_REVIEW"}""").status)
        assertEquals(HttpStatusCode.Forbidden, supplierClient(supplier.id).patch("/api/admin/alerts/$manualId") { contentType(ContentType.Application.Json); setBody("""{"title":"x"}""") }.status)
    }

    @Test
    fun suppliersSeeOnlyTheirOwnVisibleAlertsInASafeShapeAndAreNotified() = testApplication {
        val vehicles = VehicleRepository(databasePath("fleet"))
        val certificateRepository = CertificateRepository(databasePath("certificates"))
        val insightsPath = databasePath("insights")
        val insights = AdminInsightsRepository(insightsPath)
        val actor = ChangeActor("admin", "Administrator")
        val mine = vehicles.fleet.saveSupplier(null, SupplierInput("Mine AS", "123456789"), actor, Instant.now())
        val other = vehicles.fleet.saveSupplier(null, SupplierInput("Other AS", "987654321"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(null, AgreementInput(mine.id, "2026-01-01", "2030-12-31", 2, "T", saksnr = "2024/1"), null, actor, Instant.now())
        certificateRepository.add(Certificate("c1", mine.name, "Retura", null, LocalDate.now(ZoneId.of("Europe/Oslo")).plusDays(10), "c.pdf", CertificateStatus.EXPIRES_30D, agreement.id))
        application { module(vehicles, null, certificateRepository = certificateRepository, adminInsightsRepository = insights) }
        val admin = adminClient()
        val supplierA = supplierClient(mine.id); val supplierB = supplierClient(mine.id); val outsider = supplierClient(other.id)
        suspend fun create(supplierId: String, title: String, category: String = "VEHICLE_COMPLIANCE") = Json.parseToJsonElement(admin.post("/api/admin/alerts") {
            contentType(ContentType.Application.Json)
            setBody("""{"title":"$title","supplierId":"$supplierId","category":"$category","severity":"high","findingType":"CONFIRMED_DEVIATION","description":"Please fix this"}""")
        }.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        suspend fun feed(client: io.ktor.client.HttpClient, query: String = "") = Json.parseToJsonElement(client.get("/api/supplier/alerts$query").bodyAsText()).jsonArray.map { it.jsonObject }
        suspend fun notifications(client: io.ktor.client.HttpClient) = Json.parseToJsonElement(client.get("/api/notifications").bodyAsText()).jsonArray.map { it.jsonObject }

        val visible = create(mine.id, "Visible manual"); val hidden = create(mine.id, "Legacy manual"); val inCertificates = create(mine.id, "About certificates", "CERTIFICATES")
        create(other.id, "Someone else's")
        // An alert from before suppliers could see alerts stays hidden.
        java.sql.DriverManager.getConnection("jdbc:sqlite:${insightsPath.toAbsolutePath()}").use { db ->
            db.createStatement().use { it.execute("UPDATE admin_alerts SET visible_to_supplier = 0 WHERE id = '$hidden'") }
        }

        val titles = feed(supplierA).map { it.getValue("title").jsonPrimitive.content }.toSet()
        // The automatic certificate alert is visible too; the legacy manual one and another supplier's are not.
        assertEquals(setOf("Visible manual", "About certificates", "Certificate expires in 10 days"), titles)
        // Safe shape: nothing the admin keeps to themselves.
        val shape = feed(supplierA).first { it.getValue("title").jsonPrimitive.content == "Visible manual" }
        assertEquals(setOf("id", "title", "description", "severity", "category", "dueDate", "status", "createdAt"), shape.keys)
        assertEquals(setOf("About certificates", "Certificate expires in 10 days"), feed(supplierA, "?category=CERTIFICATES").map { it.getValue("title").jsonPrimitive.content }.toSet())
        assertEquals(setOf("Someone else's"), feed(outsider).map { it.getValue("title").jsonPrimitive.content }.toSet())

        // Admin workflow steps are not shown: only open or resolved.
        admin.patch("/api/admin/alerts/$visible") { contentType(ContentType.Application.Json); setBody("""{"status":"UNDER_REVIEW"}""") }
        assertEquals("OPEN", feed(supplierA).first { it.getValue("id").jsonPrimitive.content == visible }.getValue("status").jsonPrimitive.content)
        admin.patch("/api/admin/alerts/$visible") { contentType(ContentType.Application.Json); setBody("""{"status":"RESOLVED"}""") }
        assertEquals("RESOLVED", feed(supplierA).first { it.getValue("id").jsonPrimitive.content == visible }.getValue("status").jsonPrimitive.content)
        // Archived alerts disappear.
        admin.post("/api/admin/alerts/$inCertificates/archive")
        assertEquals(false, feed(supplierA).any { it.getValue("id").jsonPrimitive.content == inCertificates })

        // Every account at the supplier is notified once per alert, however often the alerts are refreshed. Admins are not.
        repeat(2) { admin.get("/api/admin/alerts") }
        val forA = notifications(supplierA)
        assertEquals(forA.map { it.getValue("alertId").jsonPrimitive.content }.toSet().size, forA.size)
        assertEquals(forA.map { it.getValue("alertId").jsonPrimitive.content }.toSet(), notifications(supplierB).map { it.getValue("alertId").jsonPrimitive.content }.toSet())
        assertEquals(true, forA.any { it.getValue("title").jsonPrimitive.content == "Visible manual" && it.getValue("type").jsonPrimitive.content == "VEHICLE_DEVIATION" && it.getValue("severity").jsonPrimitive.content == "HIGH" })
        assertEquals(0, notifications(admin).size)
        assertEquals(1, notifications(outsider).size)

        // Reading: only your own notifications, and all at once.
        val first = forA.first().getValue("id").jsonPrimitive.content
        assertEquals(HttpStatusCode.NotFound, supplierB.post("/api/notifications/$first/read").status)
        assertEquals(HttpStatusCode.NoContent, supplierA.post("/api/notifications/$first/read").status)
        assertEquals(true, notifications(supplierA).first { it.getValue("id").jsonPrimitive.content == first }.getValue("read").jsonPrimitive.content.toBoolean())
        assertEquals(HttpStatusCode.NoContent, supplierA.post("/api/notifications/read-all").status)
        assertEquals(true, notifications(supplierA).all { it.getValue("read").jsonPrimitive.content.toBoolean() })
        assertEquals(false, notifications(supplierB).any { it.getValue("read").jsonPrimitive.content.toBoolean() })

        // Admins have no supplier feed, and anonymous callers have neither route.
        assertEquals(HttpStatusCode.Forbidden, admin.get("/api/supplier/alerts").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/supplier/alerts").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/notifications").status)
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
        val alertId = Json.parseToJsonElement(admin.post("/api/admin/alerts") {
            contentType(ContentType.Application.Json)
            setBody("""{"title":"Linked alert","supplierId":"${supplier.id}","category":"VEHICLE_COMPLIANCE","severity":"medium","findingType":"CONFIRMED_DEVIATION","description":"d"}""")
        }.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        // A note can only point at an alert that exists.
        assertEquals(HttpStatusCode.BadRequest, post("""{"text":"Dangling","visibility":"INTERNAL","alertId":"no-such-alert"}""").status)
        assertEquals(HttpStatusCode.Created, post("""{"text":"Shared with admins","visibility":"INTERNAL","alertId":"$alertId"}""").status)

        val listed = Json.parseToJsonElement(admin.get("/api/admin/suppliers/${supplier.id}/notes").bodyAsText()).jsonArray
        assertEquals(listOf("Shared with admins", "Remember to call"), listed.map { it.jsonObject.getValue("text").jsonPrimitive.content })
        assertEquals(alertId, listed.first().jsonObject.getValue("alertId").jsonPrimitive.content)

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
