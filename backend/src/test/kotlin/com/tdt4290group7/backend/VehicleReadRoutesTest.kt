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
        assertEquals(HttpStatusCode.NotFound, client.get("/api/vehicles/AB10001").status)
        assertEquals(HttpStatusCode.NotFound, client.get("/api/vehicles/AB10001/checks").status)
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
            syntheticApproval("AB10001", fuelTechnology = FuelTechnology.DIESEL, expiryDate = today.toString()),
            syntheticApproval("AB10002", startDate = today.plusDays(1).toString()),
            syntheticApproval("AB10003", expiryDate = today.minusDays(1).toString()),
            syntheticApproval("AB10004"),
        )), now)
        repository.revokeApproval("AB10004", now)
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(
            syntheticTrip("AB10001", "2026-01-01", "2026-01-31", totalTripKm = "123.45".toBigDecimal()),
            syntheticTrip("AB10001", "2026-01-01", "2026-01-31", totalTripKm = "123.45".toBigDecimal()),
            syntheticTrip("AB10005", "2026-02-01", "2026-02-02"),
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
            contentType(ContentType.Application.Json); setBody("""{"registrationNumber":"AB10001"}""")
        }
        val first = Json.parseToJsonElement(check().bodyAsText()).jsonObject
        check()
        val paged = read("/api/vehicles?page=2&pageSize=2")
        assertEquals(5, paged.getValue("total").jsonPrimitive.int)
        assertEquals(listOf("AB10003", "AB10004"), paged.getValue("items").jsonArray.map { it.jsonObject.getValue("vehicle").jsonObject.getValue("registrationNumber").jsonPrimitive.content })
        assertEquals(1, read("/api/vehicles?search=ab-10001").getValue("total").jsonPrimitive.int)
        for ((status, plate) in listOf("ACTIVE" to "AB10001", "NOT_YET_ACTIVE" to "AB10002", "EXPIRED" to "AB10003", "REVOKED" to "AB10004", "NOT_APPROVED" to "AB10005")) {
            val filtered = read("/api/vehicles?approvalStatus=$status").getValue("items").jsonArray
            assertEquals(plate, filtered.single().jsonObject.getValue("vehicle").jsonObject.getValue("registrationNumber").jsonPrimitive.content)
        }
        repository.revokeApproval("AB10001", Instant.now())
        val detail = read("/api/vehicles/ab-10001")
        assertEquals("REVOKED", detail.getValue("approvalStatus").jsonPrimitive.content)
        assertEquals("ACTIVE", detail.getValue("latestCheck").jsonObject.getValue("approvalStatus").jsonPrimitive.content)
        assertEquals(2, detail.getValue("tripRows").jsonArray.size)
        assertEquals("Synthetic make", detail.getValue("latestSnapshot").jsonObject.getValue("data").jsonObject.getValue("make").jsonPrimitive.content)
        val history = read("/api/vehicles/AB10001/checks?pageSize=1")
        assertEquals(2, history.getValue("total").jsonPrimitive.int)
        assertEquals("CACHE", history.getValue("items").jsonArray.single().jsonObject.getValue("dataSource").jsonPrimitive.content)
        assertEquals(first, read("/api/vehicle-checks/${first.getValue("id").jsonPrimitive.content}"))
        assertEquals(1, lookups, "Browsing and the second cached check must not perform registry lookups")
        assertTrue(read("/api/vehicles?page=100").getValue("items").jsonArray.isEmpty())
    }
}
