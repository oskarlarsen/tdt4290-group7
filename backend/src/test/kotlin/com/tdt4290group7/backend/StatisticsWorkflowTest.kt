package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.*
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlin.test.*

class StatisticsWorkflowTest {
    private fun repository() = VehicleRepository(Path.of("build", "test-data", "statistics-${UUID.randomUUID()}.db"))

    @Test
    fun inapplicableValuesRemainExplicitNullThroughSaveListAndCheckHistory() = testApplication {
        val repository = repository()
        application { module(repository, null, Duration.ofDays(14)) }
        for (fuel in listOf(FuelTechnology.ELECTRIC, FuelTechnology.HYDROGEN)) {
            val input = syntheticTrip(fuelTechnology = fuel, totalKmCo2NotRegistered = "7.5".toBigDecimal())
            val response = client.post("/api/trip-rows") {
                contentType(ContentType.Application.Json)
                setBody(Json.encodeToString(AppendTripRowsRequest(rows = listOf(input))))
            }
            assertEquals(HttpStatusCode.Created, response.status)
            val result = Json.parseToJsonElement(response.bodyAsText()).jsonObject
            val checkId = result.getValue("checks").jsonArray.single().jsonObject.getValue("check").jsonObject.getValue("id").jsonPrimitive.content
            val historical = Json.parseToJsonElement(client.get("/api/vehicle-checks/$checkId").bodyAsText()).jsonObject.getValue("tripRows").jsonArray
            val listed = Json.parseToJsonElement(client.get("/api/trip-rows").bodyAsText()).jsonObject.getValue("items").jsonArray
            for (row in result.getValue("rows").jsonArray + historical + listed) {
                val stored = row.jsonObject
                assertEquals(JsonNull, stored.getValue("estimatedCo2Kg"))
                val data = stored.getValue("data").jsonObject
                assertFalse(data.getValue("co2Registered").jsonPrimitive.boolean)
                assertEquals("7.5", data.getValue("totalKmCo2NotRegistered").jsonPrimitive.content)
                for (field in listOf("co2GramsPerKm", "medianCo2", "totalNoxRegisteredGrams", "totalKmCo2Registered", "totalKmNoxRegistered"))
                    assertEquals(JsonNull, data.getValue(field))
            }
        }
    }

    @Test
    fun savingChecksEachDistinctPlateAfterAppendAndReusesRecentSnapshot() = testApplication {
        val repository = repository()
        var lookups = 0
        val registry = object : VehicleRegistryClient {
            override suspend fun lookup(registrationNumber: String): RegistryLookup {
                lookups++
                assertTrue(repository.tripRowsForVehicle(registrationNumber).isNotEmpty(), "Statistics must be persisted before lookup")
                return RegistryLookup.Found(RegistryVehicleData(registrationNumber, "REGISTRERT"))
            }
        }
        application { module(repository, registry, Duration.ofDays(14)) }
        suspend fun append(rows: List<TripRowInput>): JsonObject {
            val response = client.post("/api/trip-rows") {
                contentType(ContentType.Application.Json)
                setBody(Json.encodeToString(AppendTripRowsRequest(rows = rows)))
            }
            assertEquals(HttpStatusCode.Created, response.status)
            return Json.parseToJsonElement(response.bodyAsText()).jsonObject
        }
        val first = append(listOf(syntheticTrip("ab 12345"), syntheticTrip("AB12345"), syntheticTrip("CD12345")))
        assertEquals(3, first.getValue("rowCount").jsonPrimitive.int)
        val checks = first.getValue("checks").jsonArray
        assertEquals(2, checks.size)
        assertEquals(2, lookups)
        assertEquals(2, repository.findCheck(checks[0].jsonObject.getValue("check").jsonObject.getValue("id").jsonPrimitive.content)!!.tripRows.size)
        val second = append(listOf(syntheticTrip("AB12345")))
        assertEquals("CACHE", second.getValue("checks").jsonArray.single().jsonObject.getValue("check").jsonObject.getValue("dataSource").jsonPrimitive.content)
        assertEquals(2, lookups)
        assertEquals(3, repository.tripRowsForVehicle("AB12345").size)
    }

    @Test
    fun unexpectedCheckFailureReturnsCreatedAndSavedRowsWithSafeRetryMessage() = testApplication {
        val repository = repository()
        val registry = object : VehicleRegistryClient {
            override suspend fun lookup(registrationNumber: String): RegistryLookup = error("Sensitive synthetic upstream detail")
        }
        application { module(repository, registry, Duration.ofDays(14)) }
        val response = client.post("/api/trip-rows") {
            contentType(ContentType.Application.Json)
            setBody(Json.encodeToString(AppendTripRowsRequest(rows = listOf(syntheticTrip()))))
        }
        assertEquals(HttpStatusCode.Created, response.status)
        val body = response.bodyAsText()
        assertFalse(body.contains("Sensitive synthetic"))
        val result = Json.parseToJsonElement(body).jsonObject.getValue("checks").jsonArray.single().jsonObject
        assertTrue(result.getValue("error").jsonPrimitive.content.contains("do not resubmit"))
        assertEquals(1, repository.tripRowsForVehicle("AB12345").size)
    }

    @Test
    fun absentSvvConfigurationStillSavesAnIncompleteCheck() = testApplication {
        val repository = repository()
        application { module(repository, null, Duration.ofDays(14)) }
        val response = client.post("/api/trip-rows") {
            contentType(ContentType.Application.Json)
            setBody(Json.encodeToString(AppendTripRowsRequest(rows = listOf(syntheticTrip()))))
        }
        assertEquals(HttpStatusCode.Created, response.status)
        val checked = Json.parseToJsonElement(response.bodyAsText()).jsonObject.getValue("checks").jsonArray.single().jsonObject.getValue("check").jsonObject
        assertEquals("UNAVAILABLE", checked.getValue("dataSource").jsonPrimitive.content)
        assertEquals("NOT_CONFIGURED", checked.getValue("lookupOutcome").jsonPrimitive.content)
        assertEquals(1, repository.checkHistory("AB12345", 1, 10)!!.total)
    }

    @Test
    fun statisticsDirectoryPaginatesSearchesAndDoesNotCallSvv() = testApplication {
        val repository = repository()
        val now = Instant.parse("2026-01-01T00:00:00Z")
        repository.appendTripRows(AppendTripRowsRequest(rows = listOf(
            syntheticTrip("AB10001", totalTripKm = "1000".toBigDecimal(), co2GramsPerKm = "123.456".toBigDecimal()),
            syntheticTrip("AB10001"), syntheticTrip("CD10001"))), now)
        var lookups = 0
        application { module(repository, object : VehicleRegistryClient {
            override suspend fun lookup(registrationNumber: String): RegistryLookup { lookups++; return RegistryLookup.Failed(LookupOutcome.NOT_FOUND) }
        }, Duration.ofDays(14)) }
        suspend fun read(query: String) = Json.parseToJsonElement(client.get("/api/trip-rows$query").bodyAsText()).jsonObject
        val first = read("?pageSize=2")
        assertEquals(3, first.getValue("total").jsonPrimitive.int)
        assertEquals("CD10001", first.getValue("items").jsonArray.first().jsonObject.getValue("registrationNumber").jsonPrimitive.content)
        val second = read("?page=2&pageSize=2").getValue("items").jsonArray.single().jsonObject
        assertEquals("123.456", second.getValue("estimatedCo2Kg").jsonPrimitive.content)
        assertEquals(2, read("?search=ab-10001").getValue("total").jsonPrimitive.int)
        assertTrue(read("?page=100").getValue("items").jsonArray.isEmpty())
        for (query in listOf("page=0", "page=abc", "pageSize=101", "pageSize=0", "search=%25"))
            assertEquals(HttpStatusCode.BadRequest, client.get("/api/trip-rows?$query").status)
        assertEquals(0, lookups)
        assertEquals(0, repository.checkHistory("AB10001", 1, 10)!!.total)
    }
}
