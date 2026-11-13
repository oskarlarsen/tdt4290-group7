package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.supplierClient
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.client.request.get
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.sql.DriverManager
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class EnergyOversightTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val actor = ChangeActor("admin-seed", "Advisor Hansen")

    private fun newPath() = Path.of("build", "test-data", "energy-test-${UUID.randomUUID()}.db")

    private fun seedSupplier(repo: VehicleRepository, id: String, orgNumber: String): String {
        repo.database.write { db ->
            repo.database.insert(db, "suppliers", mapOf("id" to id, "name" to "$id AS", "org_number" to orgNumber, "updated_at" to Instant.now().toString(), "active" to 1))
        }
        return repo.fleet.saveAgreement(
            null,
            AgreementInput(id, "2026-01-01", "2027-12-31", 0, "Tire agreement", requiresVehicles = false, requiresEnergy = true, saksnr = "2024/1234"),
            null, actor, Instant.now()
        ).id
    }

    private fun addReport(repo: VehicleRepository, agreementId: String, location: String, quarter: Int, self: Double, goo: Double) {
        repo.database.write { db ->
            repo.database.insert(
                db, "facility_energy",
                mapOf(
                    "id" to "nrg-${UUID.randomUUID()}", "agreement_id" to agreementId, "location_code" to location, "address" to "Addr $location",
                    "storage_area_sqm" to 100.0, "workshop_area_sqm" to 50.0, "other_area_sqm" to 50.0,
                    "reporting_year" to 2026, "reporting_quarter" to quarter,
                    "electricity_kwh" to 1000.0, "district_heating_kwh" to 500.0,
                    "self_produced_solar_kwh" to self, "self_produced_heatpump_kwh" to 0.0, "goo_covered_kwh" to goo,
                    "created_at" to "2026-01-01T00:00:00Z", "updated_at" to "2026-01-01T00:00:00Z"
                )
            )
        }
    }

    @Test
    fun previewWarnsWhenAnImportReplacesAStoredQuarter() {
        val repo = VehicleRepository(newPath())
        val agreementId = seedSupplier(repo, "replace-co", "555000111")
        addReport(repo, agreementId, "LOC-1", 1, 100.0, 200.0)
        val header = "agreement_id,facility_location_code,facility_address,storage_area_sqm,workshop_area_sqm,other_area_sqm,reporting_year,reporting_quarter,electricity_kwh,district_heating_kwh,biogas_kwh,fossil_fuel_kwh,self_produced_solar_kwh,self_produced_heatpump_kwh,goo_covered_kwh,notes\n"
        fun preview(quarter: Int) = repo.onboarding.createBatchPreview(
            "replace-co", BatchEntityType.ENERGY, "e.csv",
            (header + "$agreementId,LOC-1,Addr,10,10,10,2026,$quarter,1000,500,0,0,0,0,0,\n").toByteArray(), Instant.now()
        )
        val same = preview(1)
        assertTrue(same.canCommit, same.errors.toString())
        assertEquals(1, same.notices.size)
        assertTrue(same.notices.single().contains("LOC-1 2026 Q1"))
        assertEquals(0, preview(2).notices.size)
        val gooHeavy = repo.onboarding.createBatchPreview(
            "replace-co", BatchEntityType.ENERGY, "g.csv",
            (header + "$agreementId,LOC-9,Addr,10,10,10,2026,2,1000,500,0,0,0,0,5000,\n").toByteArray(), Instant.now()
        )
        assertTrue(gooHeavy.canCommit)
        assertTrue(gooHeavy.notices.single().contains("opprinnelsesgarantier"))
    }

    @Test
    fun energyOnlyListsAgreementsForTheYearsTheyCover() {
        val repo = VehicleRepository(newPath())
        seedSupplier(repo, "dated-co", "444444444") // agreement runs 2026-2027
        assertEquals(0, repo.onboarding.getEnergySummaries(2025, 2026).size)
        assertEquals(1, repo.onboarding.getEnergySummaries(2026, 2026).size)
        assertEquals(1, repo.onboarding.getEnergySummaries(2027, 2026).size)
        assertEquals(0, repo.onboarding.getEnergySummaries(2028, 2026).size)
    }

    @Test
    fun yearlyRowsFromAnOlderDatabaseBecomeQ4Reports() {
        val path = newPath()
        val first = VehicleRepository(path)
        val agreementId = seedSupplier(first, "old-supplier", "111111111")
        // Put the table back into its pre-quarterly shape, with one yearly row.
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}").use { c ->
            c.createStatement().use {
                it.execute("DROP TABLE facility_energy")
                it.execute(
                    """CREATE TABLE facility_energy (id TEXT PRIMARY KEY, agreement_id TEXT NOT NULL, location_code TEXT NOT NULL, address TEXT NOT NULL,
                       storage_area_sqm REAL, workshop_area_sqm REAL, other_area_sqm REAL, reporting_year INTEGER NOT NULL,
                       electricity_kwh REAL NOT NULL, district_heating_kwh REAL NOT NULL, biogas_kwh REAL DEFAULT 0.0, fossil_fuel_kwh REAL DEFAULT 0.0,
                       self_produced_solar_kwh REAL DEFAULT 0.0, self_produced_heatpump_kwh REAL DEFAULT 0.0, notes TEXT,
                       created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (agreement_id, location_code, reporting_year)) STRICT"""
                )
                it.execute("INSERT INTO facility_energy VALUES ('old-1', '$agreementId', 'LOC-1', 'Addr', 1, 1, 1, 2025, 10, 20, 0, 0, 5, 0, NULL, '2025-12-31T00:00:00Z', '2025-12-31T00:00:00Z')")
            }
        }

        val reopened = VehicleRepository(path)
        val rows = reopened.onboarding.getSupplierEnergy("old-supplier")
        assertEquals(1, rows.size)
        assertEquals(4, rows[0].reportingQuarter)
        assertEquals(2025, rows[0].reportingYear)
        assertEquals(0.0, rows[0].gooCoveredKwh)
        assertEquals(5.0, rows[0].selfProducedSolarKwh)
        // A second open of the migrated file must not migrate again.
        assertEquals(1, VehicleRepository(path).onboarding.getSupplierEnergy("old-supplier").size)
    }

    @Test
    fun adminSeesComplianceAndSupplierEvidenceIsPrivate() = testApplication {
        val repo = VehicleRepository(newPath())
        application { module(repository = repo, registry = null) }
        val agreementId = seedSupplier(repo, "solar-co", "222222222")
        seedSupplier(repo, "other-co", "333333333")
        for (q in 1..4) addReport(repo, agreementId, "LOC-1", q, self = 250.0, goo = 100.0)
        val admin = adminClient()

        // No commitment yet.
        var summary = json.parseToJsonElement(admin.get("/api/admin/energy?year=2026").bodyAsText()).jsonArray
            .first { it.jsonObject["agreementId"]!!.jsonPrimitive.content == agreementId }.jsonObject
        assertEquals("NO_COMMITMENT", summary["status"]!!.jsonPrimitive.content)

        // 1000 self-produced delivered, 400 GoO delivered. Committing 1000 / 500 is short on GoO only.
        val put = admin.put("/api/admin/energy/$agreementId/commitment") {
            contentType(ContentType.Application.Json)
            setBody("""{"minSelfProducedKwh":1000,"minGooKwh":500}""")
        }
        assertEquals(HttpStatusCode.NoContent, put.status)
        summary = json.parseToJsonElement(admin.get("/api/admin/energy?year=2026").bodyAsText()).jsonArray
            .first { it.jsonObject["agreementId"]!!.jsonPrimitive.content == agreementId }.jsonObject
        assertEquals("NON_COMPLIANT", summary["status"]!!.jsonPrimitive.content)
        assertEquals(0.0, summary["selfProducedDeviationKwh"]!!.jsonPrimitive.double)
        assertEquals(-100.0, summary["gooDeviationKwh"]!!.jsonPrimitive.double)
        // Total energy = electricity + district heating + own solar, per quarter: (1000 + 500 + 250) * 4.
        assertEquals(7000.0, summary["consumedKwh"]!!.jsonPrimitive.double)
        assertEquals(1000.0 / 7000.0 * 100, summary["selfProducedSharePercent"]!!.jsonPrimitive.double, 1e-9)
        assertEquals(7000.0 / 200.0, summary["kwhPerSqm"]!!.jsonPrimitive.double, 1e-9)

        for (body in listOf("""{"minSelfProducedKwh":-1,"minGooKwh":0}""", """{"minSelfProducedKwh":1,"minGooKwh":1e30}""")) {
            assertEquals(HttpStatusCode.BadRequest, admin.put("/api/admin/energy/$agreementId/commitment") {
                contentType(ContentType.Application.Json); setBody(body)
            }.status, body)
        }
        // The rejected values must not have replaced the stored commitment.
        assertEquals(1000.0, json.parseToJsonElement(admin.get("/api/admin/energy?year=2026").bodyAsText()).jsonArray
            .first { it.jsonObject["agreementId"]!!.jsonPrimitive.content == agreementId }.jsonObject["commitment"]!!.jsonObject["minSelfProducedKwh"]!!.jsonPrimitive.double)

        // Evidence: supplier uploads, admin and owner can download, other supplier cannot.
        val supplier = supplierClient("solar-co")
        val bytes = "%PDF-1.4 meter export".toByteArray()
        suspend fun upload(name: String, content: ByteArray) = supplier.submitFormWithBinaryData(
            url = "/api/onboarding/energy/evidence",
            formData = formData {
                append("agreementId", agreementId); append("year", "2026"); append("quarter", "2")
                append("file", content, Headers.build {
                    append(HttpHeaders.ContentType, "application/pdf")
                    append(HttpHeaders.ContentDisposition, "filename=\"$name\"")
                })
            }
        )
        val created = upload("meter.pdf", bytes)
        assertEquals(HttpStatusCode.Created, created.status)
        val evidenceId = json.parseToJsonElement(created.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content
        assertEquals(HttpStatusCode.UnsupportedMediaType, upload("run.html", "<script>x</script>".toByteArray()).status)
        assertEquals(HttpStatusCode.PayloadTooLarge, upload("big.pdf", ByteArray(MAX_ENERGY_EVIDENCE_BYTES + 1)).status)

        // A supplier sees its own promise and delivery, and nobody else's.
        val own = json.parseToJsonElement(supplier.get("/api/onboarding/energy/summary?year=2026").bodyAsText()).jsonArray
        assertEquals(listOf(agreementId), own.map { it.jsonObject["agreementId"]!!.jsonPrimitive.content })
        assertEquals(1000.0, own.single().jsonObject["commitment"]!!.jsonObject["minSelfProducedKwh"]!!.jsonPrimitive.double)

        val adminDownload = admin.get("/api/admin/energy/evidence/$evidenceId")
        assertEquals(HttpStatusCode.OK, adminDownload.status)
        assertContentEquals(bytes, adminDownload.bodyAsBytes())
        assertEquals("nosniff", adminDownload.headers["X-Content-Type-Options"])
        assertTrue(adminDownload.headers[HttpHeaders.ContentDisposition]!!.startsWith("attachment"))
        assertEquals(HttpStatusCode.OK, supplier.get("/api/onboarding/energy/evidence/$evidenceId").status)
        assertEquals(HttpStatusCode.NotFound, supplierClient("other-co").get("/api/onboarding/energy/evidence/$evidenceId").status)

        // A supplier cannot attach a file to someone else's agreement.
        val forged = supplierClient("other-co").submitFormWithBinaryData(
            url = "/api/onboarding/energy/evidence",
            formData = formData {
                append("agreementId", agreementId); append("year", "2026"); append("quarter", "1")
                append("file", bytes, Headers.build { append(HttpHeaders.ContentDisposition, "filename=\"x.pdf\"") })
            }
        )
        assertEquals(HttpStatusCode.BadRequest, forged.status)
    }
}
