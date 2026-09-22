package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.RegistryLookup
import com.tdt4290group7.backend.vehicles.VehicleRegistryClient
import com.tdt4290group7.backend.vehicles.toRegistryValue
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headers
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class ApplicationTest {
    @Test
    fun comparesTripUsageWithSeparateApprovedListWithoutRegistryKey() = testApplication {
        application { module(testRepository(), null) }
        val tripImport = client.post("/api/vehicle-imports") {
            headers { append(HttpHeaders.ContentType, "application/json") }
            setBody("""{"sourceName":"trips","rows":[
                {"registrationNumber":"AB 12345","tripCount":"3"},
                {"registrationNumber":"AB12345","tripCount":"7"},
                {"registrationNumber":"CD54321","tripCount":"1"}
            ]}""")
        }
        assertEquals(HttpStatusCode.Created, tripImport.status)
        val tripId = Json.parseToJsonElement(tripImport.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        val approvedImport = client.post("/api/approved-vehicle-imports") {
            headers { append(HttpHeaders.ContentType, "application/json") }
            setBody("""{"sourceName":"approved","rows":[
                {"registrationNumber":"AB12345","fuelTechnology":"Elektrisk/Hydrogen",
                 "usedThroughoutPeriod":true,"vehicleGroup":"UNDER_7_5_TONNES_OR_UP_TO_8_PASSENGERS"}
            ]}""")
        }
        assertEquals(HttpStatusCode.Created, approvedImport.status)
        val approvedId = Json.parseToJsonElement(approvedImport.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        val comparison = client.post("/api/vehicle-comparisons") {
            headers { append(HttpHeaders.ContentType, "application/json") }
            setBody("""{"tripImportId":"$tripId","approvedImportId":"$approvedId"}""")
        }
        assertEquals(HttpStatusCode.Created, comparison.status)
        val result = Json.parseToJsonElement(comparison.bodyAsText()).jsonObject
        assertEquals("2", result.getValue("comparedVehicleCount").jsonPrimitive.content)
        assertEquals("1", result.getValue("unapprovedVehicleCount").jsonPrimitive.content)
        val byPlate = result.getValue("results").jsonArray.associateBy {
            it.jsonObject.getValue("normalizedRegistrationNumber").jsonPrimitive.content
        }
        assertEquals("ON_APPROVED_LIST", byPlate.getValue("AB12345").jsonObject.getValue("approvalMatch").jsonPrimitive.content)
        assertEquals(2, byPlate.getValue("AB12345").jsonObject.getValue("tripRowIds").jsonArray.size)
        assertEquals("NOT_ON_APPROVED_LIST", byPlate.getValue("CD54321").jsonObject.getValue("approvalMatch").jsonPrimitive.content)
        val id = result.getValue("id").jsonPrimitive.content
        val retrieved = client.get("/api/vehicle-comparisons/$id")
        assertEquals(HttpStatusCode.OK, retrieved.status)
        assertEquals(result, Json.parseToJsonElement(retrieved.bodyAsText()).jsonObject)
        val approvedRows = client.get("/api/approved-vehicle-imports/$approvedId/rows")
        assertEquals(HttpStatusCode.OK, approvedRows.status)
        assertEquals("Elektrisk/Hydrogen", Json.parseToJsonElement(approvedRows.bodyAsText()).jsonArray.single()
            .jsonObject.getValue("data").jsonObject.getValue("fuelTechnology").jsonPrimitive.content)
    }

    @Test
    fun testRootAndHealth() = testApplication {
        application {
            module(testRepository(), null)
        }

        val rootResponse = client.get("/")
        assertEquals(HttpStatusCode.OK, rootResponse.status)
        assertEquals("Hello World!", rootResponse.bodyAsText())

        val healthResponse = client.get("/health")
        assertEquals(HttpStatusCode.OK, healthResponse.status)
        assertEquals("""{"status":"UP"}""", healthResponse.bodyAsText())
    }

    @Test
    fun importsJsonAndPreservesRepeatedVehicles() = testApplication {
        application { module(testRepository(), null) }

        val importResponse = client.post("/api/vehicle-imports") {
            headers { append(HttpHeaders.ContentType, "application/json") }
            setBody(
                """{"sourceName":"bus-trips","rows":[
                    {"registrationNumber":"AB 12345","assignmentNumber":"A-1","kmPerBus":"45.5"},
                    {"registrationNumber":"AB12345","assignmentNumber":"A-2","kmPerBus":"62"}
                ]}""",
            )
        }
        assertEquals(HttpStatusCode.Created, importResponse.status)
        val imported = Json.parseToJsonElement(importResponse.bodyAsText()).jsonObject
        assertEquals("2", imported.getValue("rowCount").jsonPrimitive.content)
        assertEquals("1", imported.getValue("distinctVehicleCount").jsonPrimitive.content)
        val id = imported.getValue("id").jsonPrimitive.content

        val rowsResponse = client.get("/api/vehicle-imports/$id/rows")
        assertEquals(HttpStatusCode.OK, rowsResponse.status)
        val rows = Json.parseToJsonElement(rowsResponse.bodyAsText()).jsonArray
        assertEquals(2, rows.size)
        assertEquals("AB12345", rows[0].jsonObject.getValue("normalizedRegistrationNumber").jsonPrimitive.content)
        assertEquals("A-1", rows[0].jsonObject.getValue("data").jsonObject.getValue("assignmentNumber").jsonPrimitive.content)
        assertEquals("A-2", rows[1].jsonObject.getValue("data").jsonObject.getValue("assignmentNumber").jsonPrimitive.content)

        val checkResponse = client.post("/api/vehicle-imports/$id/checks")
        assertEquals(HttpStatusCode.ServiceUnavailable, checkResponse.status)
    }

    @Test
    fun runsRegistryCheckAndReadsLatestResult() = testApplication {
        val registry = VehicleRegistryClient {
            RegistryLookup.Found(
                Json.parseToJsonElement(
                    """{"kjoretoydataListe":[{"registrering":{"registreringsstatus":{"kodeVerdi":"UTFORT"}}}]}""",
                ).toRegistryValue(),
            )
        }
        application { module(testRepository(), registry) }
        val importResponse = client.post("/api/vehicle-imports") {
            headers { append(HttpHeaders.ContentType, "application/json") }
            setBody("""{"sourceName":"test","rows":[{"registrationNumber":"AB12345"}]}""")
        }
        val id = Json.parseToJsonElement(importResponse.bodyAsText()).jsonObject.getValue("id").jsonPrimitive.content
        val checkResponse = client.post("/api/vehicle-imports/$id/checks")
        assertEquals(HttpStatusCode.Created, checkResponse.status)
        val checked = Json.parseToJsonElement(checkResponse.bodyAsText()).jsonObject
        assertEquals("1", checked.getValue("deviationCount").jsonPrimitive.content)
        val result = checked.getValue("results").jsonArray.single().jsonObject
        assertEquals("EXPORTED", result.getValue("deviations").jsonArray.single().jsonPrimitive.content)
        assertEquals("UNKNOWN", result.getValue("usageProhibitionState").jsonPrimitive.content)

        val latest = client.get("/api/vehicle-imports/$id/checks/latest")
        assertEquals(HttpStatusCode.OK, latest.status)
        assertEquals(checked, Json.parseToJsonElement(latest.bodyAsText()).jsonObject)
    }

    private fun testRepository() = VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db"))
}
