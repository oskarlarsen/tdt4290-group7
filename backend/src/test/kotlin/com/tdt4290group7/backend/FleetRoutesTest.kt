package com.tdt4290group7.backend

import com.tdt4290group7.backend.auth.AuthCookie
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.vehicles.*
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.util.UUID
import kotlinx.serialization.json.*
import kotlin.test.*

class FleetRoutesTest {
    private fun repository() = VehicleRepository(Path.of("build", "test-data", "fleet-routes-${UUID.randomUUID()}.db"))

    @Test fun adminCanCreateAgreementReplaceWithPlannedEntryAndUndo() = testApplication {
        val repo = repository()
        application { module(repo, null) }
        val admin = adminClient()
        suspend fun post(path: String, body: String): JsonObject {
            val response = admin.post(path) { contentType(ContentType.Application.Json); setBody(body) }
            assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
            return Json.parseToJsonElement(response.bodyAsText()).jsonObject
        }
        val supplier = post("/api/vehicle-fleet/suppliers", """{"name":"Test supplier","orgNumber":"123456789"}""")
        val agreement = post("/api/vehicle-fleet/agreements", """{"supplierId":${supplier["id"]},"startDate":"2026-01-01","endDate":"2027-12-31","allowedVehicles":1}""")
        val vehicle = post("/api/vehicle-fleet/agreements/${agreement["id"]!!.jsonPrimitive.content}/vehicles", """{"registrationNumber":"ab 12345"}""")
        val next = admin.post("/api/vehicle-fleet/vehicles/AB12345/replace") {
            contentType(ContentType.Application.Json)
            setBody("""{"replacement":{"planned":true},"expectedUpdatedAt":${vehicle["updatedAt"]}}""")
        }
        assertEquals(HttpStatusCode.OK, next.status, next.bodyAsText())
        assertTrue(Json.parseToJsonElement(next.bodyAsText()).jsonObject["planned"]!!.jsonPrimitive.boolean)
        val event = repo.fleet.history(1).first()
        assertEquals("Advisor Hansen", event.actorName)
        assertEquals(HttpStatusCode.NoContent, admin.post("/api/vehicle-fleet/history/${event.id}/undo").status)
        assertEquals("AB12345", repo.fleet.overview().vehicles.single { it.listed }.registrationNumber)
        assertEquals(HttpStatusCode.Conflict, admin.post("/api/vehicle-fleet/history/${event.id}/undo").status)
    }

    @Test fun fleetRoutesRequireAnAdminAndIgnoreClientSuppliedActor() = testApplication {
        application { module(repository(), null) }
        startApplication()
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/vehicle-fleet").status)
        val supplier = UserRepository.findByEmail("supplier@nordvik.no")!!
        val token = JwtConfig.generateToken(supplier, false).first
        assertEquals(HttpStatusCode.Forbidden, client.post("/api/vehicle-fleet/suppliers") {
            cookie(AuthCookie.NAME, token); contentType(ContentType.Application.Json)
            setBody("""{"name":"Test","orgNumber":"123456789"}""")
        }.status)
        assertEquals(HttpStatusCode.BadRequest, adminClient().post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Test","orgNumber":"123456789","actorName":"Someone else"}""")
        }.status)
    }

    @Test fun readsNeverCreateVehiclesOrCallSvvAndRejectBadQueries() = testApplication {
        val repo = repository(); var calls = 0
        application { module(repo, VehicleRegistryClient { calls++; RegistryLookup.Failed(LookupOutcome.NOT_FOUND) }) }
        val admin = adminClient()
        assertEquals(HttpStatusCode.NotFound, admin.get("/api/vehicles/AB12345").status)
        assertEquals(HttpStatusCode.NotFound, admin.get("/api/vehicles/AB12345/checks").status)
        assertEquals(HttpStatusCode.OK, admin.get("/api/vehicle-fleet").status)
        for (query in listOf("page=0", "page=abc", "pageSize=101", "search=%25"))
            assertEquals(HttpStatusCode.BadRequest, admin.get("/api/trip-rows?$query").status)
        assertEquals(0, calls)
        assertNull(repo.vehicleDetails("AB12345"))
        assertEquals(HttpStatusCode.NotFound, admin.post("/api/vehicle-approvals").status)
    }

    @Test fun fleetRejectsCoercedNumbersBooleansAndInvalidHistoryPages() = testApplication {
        application { module(repository(), null) }
        val admin = adminClient()
        assertEquals(HttpStatusCode.BadRequest, admin.post("/api/vehicle-fleet/agreements") {
            contentType(ContentType.Application.Json)
            setBody("""{"supplierId":"unused","startDate":"2026-01-01","endDate":"2026-12-31","allowedVehicles":"5"}""")
        }.status)
        assertEquals(HttpStatusCode.BadRequest, admin.post("/api/vehicle-fleet/agreements/unused/vehicles") {
            contentType(ContentType.Application.Json)
            setBody("""{"planned":"true"}""")
        }.status)
        assertEquals(HttpStatusCode.BadRequest, admin.get("/api/vehicle-fleet/history?page=abc").status)
    }
}
