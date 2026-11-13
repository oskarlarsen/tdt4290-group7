package com.tdt4290group7.backend

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

    @Test fun supplierUpdatesRequireTheVersionReturnedByTheApi() = testApplication {
        val repo = repository()
        application { module(repo, null) }
        val admin = adminClient()
        val created = admin.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json); setBody("""{"name":"Original","orgNumber":"123456789"}""")
        }
        assertEquals(HttpStatusCode.Created, created.status)
        val supplier = Json.parseToJsonElement(created.bodyAsText()).jsonObject
        val id = supplier.getValue("id").jsonPrimitive.content
        val version = supplier.getValue("updatedAt")
        assertTrue(version.jsonPrimitive.content.isNotBlank())
        suspend fun update(body: String) = admin.put("/api/vehicle-fleet/suppliers/$id") {
            contentType(ContentType.Application.Json); setBody(body)
        }
        val valid = """{"supplier":{"name":"Current edit","orgNumber":"123456789"},"expectedUpdatedAt":$version}"""
        assertEquals(HttpStatusCode.OK, update(valid).status)
        val before = repo.fleet.overview()
        assertEquals(HttpStatusCode.Conflict, update(valid.replace("Current edit", "Stale edit")).status)
        for (invalid in listOf(
            """{"supplier":{"name":"Missing version","orgNumber":"123456789"}}""",
            valid.replace("\"expectedUpdatedAt\":$version", "\"expectedUpdatedAt\":123"),
            valid.replace("\"name\":\"Current edit\"", "\"name\":123"),
        )) assertEquals(HttpStatusCode.BadRequest, update(invalid).status)
        assertEquals(before, repo.fleet.overview())
    }

    @Test fun removingSupplierDeactivatesFleetDataRejectsPendingInvitationsAndBlocksSupplierAccess() = testApplication {
        val repo = repository()
        application { module(repo, null) }
        val admin = adminClient()
        val created = admin.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json); setBody("""{"name":"Supplier to remove","orgNumber":"123456789"}""")
        }
        assertEquals(HttpStatusCode.Created, created.status)
        val supplierJson = Json.parseToJsonElement(created.bodyAsText()).jsonObject
        val supplierId = supplierJson.getValue("id").jsonPrimitive.content
        val supplierVersion = supplierJson.getValue("updatedAt").jsonPrimitive.content
        val agreement = repo.fleet.saveAgreement(null, AgreementInput(supplierId, "2026-01-01", "2027-12-31", 1, saksnr = "2024/1234"), null,
            ChangeActor("admin", "Admin"), java.time.Instant.now())
        repo.fleet.addVehicle(agreement.id, VehicleEntryInput("AB12345"), ChangeActor("admin", "Admin"), java.time.Instant.now())

        val existingSupplierUser = supplierClient(supplierId)
        val supplierEmail = Json.parseToJsonElement(existingSupplierUser.get("/api/auth/me").bodyAsText())
            .jsonObject.getValue("email").jsonPrimitive.content
        val pendingInvitation = admin.post("/api/vehicle-fleet/suppliers/$supplierId/invitations") {
            contentType(ContentType.Application.Json); setBody("""{"email":"pending-${UUID.randomUUID()}@example.no"}""")
        }
        assertEquals(HttpStatusCode.Created, pendingInvitation.status)
        val invitationToken = Json.parseToJsonElement(pendingInvitation.bodyAsText()).jsonObject.getValue("token").jsonPrimitive.content

        val removal = admin.delete("/api/vehicle-fleet/suppliers/$supplierId") {
            contentType(ContentType.Application.Json); setBody("""{"expectedUpdatedAt":"$supplierVersion"}""")
        }

        assertEquals(HttpStatusCode.NoContent, removal.status, removal.bodyAsText())
        assertTrue(repo.fleet.overview().suppliers.isEmpty())
        assertTrue(repo.fleet.overview().agreements.isEmpty())
        assertFalse(repo.fleet.overview().vehicles.single().listed)
        assertEquals(HttpStatusCode.Forbidden, existingSupplierUser.get("/api/supplier/overview").status)
        assertEquals(HttpStatusCode.Unauthorized, existingSupplierUser.get("/api/auth/me").status)
        assertEquals(HttpStatusCode.Unauthorized, client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"$supplierEmail","password":"test-only-supplier-password"}""")
        }.status)
        val accepted = client.post("/api/auth/accept-invitation") {
            contentType(ContentType.Application.Json)
            setBody("""{"token":"$invitationToken","newPassword":"test-only-supplier-password"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, accepted.status)
        assertEquals(HttpStatusCode.Conflict, admin.delete("/api/vehicle-fleet/suppliers/$supplierId") {
            contentType(ContentType.Application.Json); setBody("""{"expectedUpdatedAt":"$supplierVersion"}""")
        }.status)
    }

    private fun agreement(repo: VehicleRepository, allowance: Int = 3): FleetAgreement {
        val now = java.time.Instant.now()
        val actor = ChangeActor("test", "Test")
        val supplier = repo.fleet.saveSupplier(null, SupplierInput("Test", "123456789"), actor, now)
        return repo.fleet.saveAgreement(null, AgreementInput(supplier.id, "2026-01-01", "2027-12-31", allowance, saksnr = "2024/1234"), null, actor, now)
    }

    @Test fun addingPersistsSnapshotAndRunsTheDeviationCheckAutomatically() = testApplication {
        val repo = repository(); val agreement = agreement(repo); var calls = 0
        var outcome: RegistryLookup = RegistryLookup.Failed(LookupOutcome.NOT_FOUND)
        application { module(repo, VehicleRegistryClient { calls++; outcome }) }
        val admin = adminClient()
        suspend fun add() = admin.post("/api/vehicle-fleet/agreements/${agreement.id}/vehicles") {
            contentType(ContentType.Application.Json); setBody("""{"registrationNumber":"ab 12345"}""")
        }
        // Being on the list approves the vehicle, so a failed lookup still adds it, just without registry details.
        for (failure in listOf(LookupOutcome.NOT_FOUND, LookupOutcome.TEMPORARILY_UNAVAILABLE)) {
            outcome = RegistryLookup.Failed(failure)
            assertEquals(HttpStatusCode.Created, add().status)
            assertNull(repo.vehicleDetails("AB12345")!!.latestSnapshot)
            val vehicle = repo.fleet.overview().vehicles.single()
            assertEquals(if (failure == LookupOutcome.NOT_FOUND) "NOT_FOUND" else "UNAVAILABLE", vehicle.registryProblem)
            repo.fleet.removeVehicle(vehicle.registrationNumber, vehicle.updatedAt, ChangeActor("test", "Test"), java.time.Instant.now())
        }
        val data = RegistryVehicleData("AB12345", make = "Test", euroClass = RegistryCode("6"),
            lastApprovedInspectionDate = "2025-02-01", nextInspectionDueDate = "2027-02-01")
        outcome = RegistryLookup.Found(data)
        assertEquals(HttpStatusCode.Created, add().status)
        val details = repo.vehicleDetails("AB12345")!!
        assertEquals(data, details.latestSnapshot!!.data)
        assertTrue(details.tripRows.isEmpty()); assertNotNull(details.latestCheck)
        // Each failed add looks the plate up twice (the add, then the automatic check); the successful one reuses its fresh snapshot.
        assertEquals(5, calls)
    }

    @Test fun failedReplacementKeepsOriginalAndPlannedEntrySkipsLookup() = testApplication {
        val repo = repository(); val agreement = agreement(repo); var calls = 0
        application { module(repo, VehicleRegistryClient { calls++; RegistryLookup.Failed(LookupOutcome.NOT_FOUND) }) }
        val admin = adminClient()
        val added = admin.post("/api/vehicle-fleet/agreements/${agreement.id}/vehicles") {
            contentType(ContentType.Application.Json); setBody("""{"planned":true}""")
        }
        assertEquals(HttpStatusCode.Created, added.status); assertEquals(0, calls)
        val planned = repo.fleet.overview().vehicles.single()
        val before = repo.fleet.overview()
        val failed = admin.post("/api/vehicle-fleet/vehicles/${planned.registrationNumber}/replace") {
            contentType(ContentType.Application.Json)
            setBody("""{"replacement":{"registrationNumber":"CD12345"},"expectedUpdatedAt":"${planned.updatedAt}"}""")
        }
        assertEquals(HttpStatusCode.OK, failed.status)
        assertTrue(repo.fleet.overview().vehicles.single { it.registrationNumber == "CD12345" }.listed); assertNull(repo.vehicleDetails("CD12345")!!.latestSnapshot); assertEquals(1, calls)
    }

    @Test fun capacityIsRecheckedAfterRemoteLookupAndFailureDoesNotSaveSnapshot() = testApplication {
        val repo = repository(); val agreement = agreement(repo, 1)
        application { module(repo, VehicleRegistryClient {
            repo.fleet.saveAgreement(agreement.id, AgreementInput(agreement.supplierId, agreement.startDate, agreement.endDate, 0, saksnr = "2024/1234"),
                agreement.updatedAt, ChangeActor("test", "Concurrent administrator"), java.time.Instant.now())
            RegistryLookup.Found(RegistryVehicleData(it))
        }) }
        val response = adminClient().post("/api/vehicle-fleet/agreements/${agreement.id}/vehicles") {
            contentType(ContentType.Application.Json); setBody("""{"registrationNumber":"AB12345"}""")
        }
        assertEquals(HttpStatusCode.Conflict, response.status)
        assertNull(repo.vehicleDetails("AB12345")); assertNull(repo.latestSnapshot("AB12345"))
    }

    @Test fun adminCanCreateAgreementReplaceWithPlannedEntryAndUndo() = testApplication {
        val repo = repository()
        application { module(repo, VehicleRegistryClient { RegistryLookup.Found(RegistryVehicleData(it)) }) }
        val admin = adminClient()
        suspend fun post(path: String, body: String): JsonObject {
            val response = admin.post(path) { contentType(ContentType.Application.Json); setBody(body) }
            assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
            return Json.parseToJsonElement(response.bodyAsText()).jsonObject
        }
        val supplier = post("/api/vehicle-fleet/suppliers", """{"name":"Test supplier","orgNumber":"123456789"}""")
        val agreement = post("/api/vehicle-fleet/agreements", """{"supplierId":${supplier["id"]},"saksnr":"2024/1234","startDate":"2026-01-01","endDate":"2027-12-31","allowedVehicles":1}""")
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

    @Test fun agreementWithoutSaksnrIsRejected() = testApplication {
        val repo = repository()
        application { module(repo, null) }
        val admin = adminClient()
        val created = admin.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json); setBody("""{"name":"Saksnr test","orgNumber":"123456789"}""")
        }
        val supplierId = Json.parseToJsonElement(created.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content
        suspend fun create(extra: String) = admin.post("/api/vehicle-fleet/agreements") {
            contentType(ContentType.Application.Json)
            setBody("""{"supplierId":"$supplierId","startDate":"2026-01-01","endDate":"2027-12-31","allowedVehicles":1$extra}""")
        }
        assertEquals(HttpStatusCode.BadRequest, create("").status)
        assertEquals(HttpStatusCode.BadRequest, create(""","saksnr":"  """").status)
        assertEquals(HttpStatusCode.Created, create(""","saksnr":"2024/1234"""").status)
    }

    @Test fun fleetRoutesRequireAnAdminAndIgnoreClientSuppliedActor() = testApplication {
        val repo = repository()
        application { module(repo, null) }
        startApplication()
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/vehicle-fleet").status)
        val admin = adminClient()
        val created = admin.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Supplier role test","orgNumber":"123456789"}""")
        }
        val supplierId = Json.parseToJsonElement(created.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.content
        val supplier = supplierClient(supplierId)
        assertEquals(HttpStatusCode.Forbidden, supplier.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Test","orgNumber":"123456789"}""")
        }.status)
        assertEquals(HttpStatusCode.Forbidden, supplier.post("/api/vehicle-fleet/suppliers/$supplierId/invitations") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"new-contact@example.no"}""")
        }.status)
        assertEquals(HttpStatusCode.BadRequest, admin.post("/api/vehicle-fleet/suppliers") {
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
