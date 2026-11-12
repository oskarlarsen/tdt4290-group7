package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleEntryInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class SharedVehicleRoutesTest {
    private val actor = ChangeActor("admin", "Administrator")

    @Test
    fun aTruckTwoSuppliersUseIsCheckedSeenAndRemovedPerAgreement() = testApplication {
        val repo = VehicleRepository(Path.of("build", "test-data", "shared-${UUID.randomUUID()}.db"))
        val food = repo.fleet.saveSupplier(null, SupplierInput("Food Supplier AS", "100000001"), actor, Instant.now())
        val waste = repo.fleet.saveSupplier(null, SupplierInput("Waste Supplier AS", "100000002"), actor, Instant.now())
        val foodAgreement = repo.fleet.saveAgreement(null, AgreementInput(food.id, "2026-01-01", "2099-12-31", 5, saksnr = "F/1"), null, actor, Instant.now())
        val wasteAgreement = repo.fleet.saveAgreement(null, AgreementInput(waste.id, "2026-01-01", "2099-12-31", 5, saksnr = "W/1"), null, actor, Instant.now())
        val foodListing = repo.fleet.addVehicle(foodAgreement.id, VehicleEntryInput("AB12345"), actor, Instant.now())
        repo.fleet.addVehicle(wasteAgreement.id, VehicleEntryInput("AB12345"), actor, Instant.now())
        application { module(repo, null) }
        val admin = adminClient()

        suspend fun check(agreementId: String?) = admin.post("/api/vehicle-checks") {
            contentType(ContentType.Application.Json)
            setBody("""{"registrationNumber":"AB12345"${if (agreementId != null) ""","agreementId":"$agreementId"""" else ""}}""")
        }
        fun json(text: String) = Json.parseToJsonElement(text).jsonObject

        // A check is made against one agreement and records that agreement and its supplier.
        val foodCheck = check(foodAgreement.id)
        assertEquals(HttpStatusCode.Created, foodCheck.status, foodCheck.bodyAsText())
        val wasteCheck = check(wasteAgreement.id)
        assertEquals(HttpStatusCode.Created, wasteCheck.status)
        val foodBody = json(foodCheck.bodyAsText()); val wasteBody = json(wasteCheck.bodyAsText())
        assertNotEquals(foodBody.getValue("id"), wasteBody.getValue("id"))
        assertEquals(food.id, foodBody.getValue("agreement").jsonObject.getValue("supplier").jsonObject.getValue("id").jsonPrimitive.content)
        assertEquals(waste.id, wasteBody.getValue("agreement").jsonObject.getValue("supplier").jsonObject.getValue("id").jsonPrimitive.content)
        assertEquals(HttpStatusCode.BadRequest, check("no-such-agreement").status)

        // Each supplier's view of the truck shows its own agreement and its own latest check.
        fun latestCheckId(details: String) = json(details).getValue("latestCheck").jsonObject.getValue("id").jsonPrimitive.content
        fun agreementOf(details: String) = json(details).getValue("agreement").jsonObject.getValue("agreement").jsonObject.getValue("id").jsonPrimitive.content
        val foodView = admin.get("/api/vehicles/AB12345?agreementId=${foodAgreement.id}").bodyAsText()
        val wasteView = admin.get("/api/vehicles/AB12345?agreementId=${wasteAgreement.id}").bodyAsText()
        assertEquals(foodAgreement.id, agreementOf(foodView)); assertEquals(foodBody.getValue("id").jsonPrimitive.content, latestCheckId(foodView))
        assertEquals(wasteAgreement.id, agreementOf(wasteView)); assertEquals(wasteBody.getValue("id").jsonPrimitive.content, latestCheckId(wasteView))
        assertEquals(HttpStatusCode.NotFound, admin.get("/api/vehicles/AB12345?agreementId=nope").status)

        // The overview lists the truck once per agreement.
        val listings = json(admin.get("/api/vehicle-fleet").bodyAsText()).getValue("vehicles").jsonArray.map { it.jsonObject }.filter { it.getValue("registrationNumber").jsonPrimitive.content == "AB12345" }
        assertEquals(setOf(foodAgreement.id, wasteAgreement.id), listings.map { it.getValue("agreementId").jsonPrimitive.content }.toSet())

        // Removing needs to say which listing; the other supplier's stays.
        fun remove(agreementId: String?) = suspend {
            admin.delete("/api/vehicle-fleet/vehicles/AB12345${if (agreementId != null) "?agreementId=$agreementId" else ""}") {
                contentType(ContentType.Application.Json); setBody("""{"expectedUpdatedAt":"${foodListing.updatedAt}"}""")
            }
        }
        assertEquals(HttpStatusCode.BadRequest, remove(null)().status)
        assertEquals(HttpStatusCode.NoContent, remove(foodAgreement.id)().status)
        val left = repo.fleet.overview().vehicles.filter { it.listed }
        assertEquals(listOf(wasteAgreement.id), left.map { it.agreementId })
        assertTrue(json(admin.get("/api/vehicles/AB12345?agreementId=${wasteAgreement.id}").bodyAsText()).getValue("vehicle").jsonObject.getValue("listed").jsonPrimitive.content.toBoolean())
    }

    @Test
    fun aVehicleAlertGoesOnlyToTheSupplierWhoseAgreementWasChecked() = testApplication {
        val repo = VehicleRepository(Path.of("build", "test-data", "shared-alerts-${UUID.randomUUID()}.db"))
        val first = repo.fleet.saveSupplier(null, SupplierInput("First Supplier AS", "200000001"), actor, Instant.now())
        val second = repo.fleet.saveSupplier(null, SupplierInput("Second Supplier AS", "200000002"), actor, Instant.now())
        val firstAgreement = repo.fleet.saveAgreement(null, AgreementInput(first.id, "2026-01-01", "2099-12-31", 5, saksnr = "A/1"), null, actor, Instant.now())
        val secondAgreement = repo.fleet.saveAgreement(null, AgreementInput(second.id, "2026-01-01", "2099-12-31", 5, saksnr = "B/1"), null, actor, Instant.now())
        repo.fleet.addVehicle(firstAgreement.id, VehicleEntryInput("CD12345"), actor, Instant.now())
        repo.fleet.addVehicle(secondAgreement.id, VehicleEntryInput("CD12345"), actor, Instant.now())
        application { module(repo, null) }
        val admin = adminClient()
        assertEquals(HttpStatusCode.Created, admin.post("/api/vehicle-checks") {
            contentType(ContentType.Application.Json); setBody("""{"registrationNumber":"CD12345","agreementId":"${firstAgreement.id}"}""")
        }.status)

        val alerts = Json.parseToJsonElement(admin.get("/api/admin/alerts").bodyAsText()).jsonArray.map { it.jsonObject }
            .filter { it.getValue("category").jsonPrimitive.content == "VEHICLE_COMPLIANCE" }
        val suppliers = alerts.map { it.getValue("supplierId").jsonPrimitive.content }.toSet()
        assertEquals(setOf(first.id), suppliers, "only the checked agreement's supplier gets the alert: $alerts")
    }
}
