package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.*
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.json.*
import kotlin.test.*

class VehicleReadRoutesTest {
    private fun repository() = VehicleRepository(Path.of("build", "test-data", "read-${UUID.randomUUID()}.db"))

    @Test
    fun readsNeverInsertUnknownVehiclesOrCallRegistryAndRejectInvalidQueries() = testApplication {
        val repository = repository()
        var lookups = 0
        val registry = object : VehicleRegistryClient {
            override suspend fun lookup(registrationNumber: String): RegistryLookup { lookups++; return RegistryLookup.Failed(LookupOutcome.NOT_FOUND) }
        }
        application { module(repository, registry, Duration.ofDays(14)) }
        assertEquals(HttpStatusCode.NotFound, client.get("/api/vehicles/TEST01").status)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/vehicles/TEST01/checks").status)
        for (query in listOf("page=0", "page=-1", "page=abc", "page=999999999999", "pageSize=101", "pageSize=0", "approvalStatus=NO", "search=%25")) {
            assertEquals(HttpStatusCode.BadRequest, client.get("/api/vehicles?$query").status, query)
        }
        val result = Json.parseToJsonElement(client.get("/api/vehicles").bodyAsText()).jsonObject
        assertEquals(0, result.getValue("total").jsonPrimitive.int)
        assertEquals(0, lookups)
    }

    @Test
    fun pagesSearchAndCurrentApprovalDoNotChangeHistoricalCheckEvidence() = testApplication {
        val repository = repository()
        val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
        val now = Instant.now()
        repository.upsertApprovals(UpsertApprovalsRequest(approvals = listOf(
            ApprovalInput("TEST01", fuelTechnology = "Synthetic fuel", expiryDate = today.toString()),
            ApprovalInput("TEST02", startDate = today.plusDays(1).toString()),
            ApprovalInput("TEST03", expiryDate = today.minusDays(1).toString()),
            ApprovalInput("TEST04"),
        )), now)
        repository.revokeApproval("TEST04", now)
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(
            TripRowInput("TEST01", "2026-01-01", "2026-01-31", totalTripKm = "123.45".toBigDecimal()),
            TripRowInput("TEST01", "2026-01-01", "2026-01-31", totalTripKm = "123.45".toBigDecimal()),
            TripRowInput("TEST05", "2026-02-01", "2026-02-02"),
        )), now)
        var lookups = 0
        val registry = object : VehicleRegistryClient {
            override suspend fun lookup(registrationNumber: String): RegistryLookup {
                lookups++
                return RegistryLookup.Found(RegistryVehicleData(registrationNumber, "REGISTRERT", make = "Synthetic make"))
            }
        }
        application { module(repository, registry, Duration.ofDays(14)) }
        suspend fun read(url: String) = Json.parseToJsonElement(client.get(url).bodyAsText()).jsonObject
        suspend fun check() = client.post("/api/vehicle-checks") {
            contentType(ContentType.Application.Json); setBody("""{"registrationNumber":"TEST01"}""")
        }
        val first = Json.parseToJsonElement(check().bodyAsText()).jsonObject
        check()
        val paged = read("/api/vehicles?page=2&pageSize=2")
        assertEquals(5, paged.getValue("total").jsonPrimitive.int)
        assertEquals(listOf("TEST03", "TEST04"), paged.getValue("items").jsonArray.map { it.jsonObject.getValue("vehicle").jsonObject.getValue("registrationNumber").jsonPrimitive.content })
        assertEquals(1, read("/api/vehicles?search=test-01").getValue("total").jsonPrimitive.int)
        for ((status, plate) in listOf("ACTIVE" to "TEST01", "NOT_YET_ACTIVE" to "TEST02", "EXPIRED" to "TEST03", "REVOKED" to "TEST04", "NOT_APPROVED" to "TEST05")) {
            val filtered = read("/api/vehicles?approvalStatus=$status").getValue("items").jsonArray
            assertEquals(plate, filtered.single().jsonObject.getValue("vehicle").jsonObject.getValue("registrationNumber").jsonPrimitive.content)
        }
        repository.revokeApproval("TEST01", Instant.now())
        val detail = read("/api/vehicles/test-01")
        assertEquals("REVOKED", detail.getValue("approvalStatus").jsonPrimitive.content)
        assertEquals("ACTIVE", detail.getValue("latestCheck").jsonObject.getValue("approvalStatus").jsonPrimitive.content)
        assertEquals(2, detail.getValue("tripRows").jsonArray.size)
        assertEquals("Synthetic make", detail.getValue("latestSnapshot").jsonObject.getValue("data").jsonObject.getValue("make").jsonPrimitive.content)
        val history = read("/api/vehicles/TEST01/checks?pageSize=1")
        assertEquals(2, history.getValue("total").jsonPrimitive.int)
        assertEquals("CACHE", history.getValue("items").jsonArray.single().jsonObject.getValue("dataSource").jsonPrimitive.content)
        assertEquals(first, read("/api/vehicle-checks/${first.getValue("id").jsonPrimitive.content}"))
        assertEquals(1, lookups, "Browsing and the second cached check must not perform registry lookups")
        assertTrue(read("/api/vehicles?page=100").getValue("items").jsonArray.isEmpty())
    }
}
