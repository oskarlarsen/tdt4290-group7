package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headers
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class ApplicationTest {
    @Test
    fun rootAndHealth() = testApplication {
        application { module(testRepository(), null, Duration.ofDays(14)) }

        assertEquals(HttpStatusCode.OK, client.get("/").status)
        val health = client.get("/health")
        assertEquals(HttpStatusCode.OK, health.status)
        assertEquals("""{"status":"UP"}""", health.bodyAsText())
    }

    @Test
    fun appendsTripsAndReturnsCombinedPlateCheckWithoutApiKey() = testApplication {
        application { module(testRepository(), null, Duration.ofDays(14)) }

        val trips = postJson(
            "/api/trip-rows",
            """{"sourceName":"trip-sheet","rows":[
                {"registrationNumber":"AB 12345","tripCount":"3","totalTripKm":"45.5"},
                {"registrationNumber":"AB12345","tripCount":"7","totalTripKm":"62"}
            ]}""",
        )
        assertEquals(HttpStatusCode.Created, trips.status)
        val tripResponse = Json.parseToJsonElement(trips.bodyAsText()).jsonObject
        assertEquals("2", tripResponse.getValue("rowCount").jsonPrimitive.content)
        assertEquals("1", tripResponse.getValue("distinctVehicleCount").jsonPrimitive.content)

        val approvals = postJson(
            "/api/vehicle-approvals",
            """{"sourceName":"approved-sheet","approvals":[{
                "registrationNumber":"AB12345","fuelTechnology":"Elektrisk/Hydrogen",
                "usedThroughoutPeriod":true
            }]}""",
        )
        assertEquals(HttpStatusCode.Created, approvals.status)

        val check = postJson(
            "/api/vehicle-checks",
            """{"registrationNumber":"AB-12345"}""",
        )
        assertEquals(HttpStatusCode.Created, check.status)
        val checked = Json.parseToJsonElement(check.bodyAsText()).jsonObject
        assertEquals("AB12345", checked.getValue("vehicle").jsonObject
            .getValue("normalizedRegistrationNumber").jsonPrimitive.content)
        assertEquals("ACTIVE", checked.getValue("approvalStatus").jsonPrimitive.content)
        assertEquals(2, checked.getValue("tripRows").jsonArray.size)
        assertEquals("UNAVAILABLE", checked.getValue("registry").jsonObject
            .getValue("dataSource").jsonPrimitive.content)
        assertEquals("NOT_CONFIGURED", checked.getValue("registry").jsonObject
            .getValue("lookupOutcome").jsonPrimitive.content)

        val id = checked.getValue("id").jsonPrimitive.content
        val saved = client.get("/api/vehicle-checks/$id")
        assertEquals(HttpStatusCode.OK, saved.status)
        assertEquals(checked, Json.parseToJsonElement(saved.bodyAsText()).jsonObject)
    }

    @Test
    fun revocationIsRetainedAndReapprovalCreatesNewRecord() = testApplication {
        application { module(testRepository(), null, Duration.ofDays(14)) }
        val first = postJson(
            "/api/vehicle-approvals",
            """{"approvals":[{"registrationNumber":"AB12345"}]}""",
        )
        val firstId = Json.parseToJsonElement(first.bodyAsText()).jsonObject
            .getValue("approvals").jsonArray.single().jsonObject.getValue("id").jsonPrimitive.content

        val revoked = client.post("/api/vehicle-approvals/AB12345/revoke")
        assertEquals(HttpStatusCode.OK, revoked.status)
        val revokedJson = Json.parseToJsonElement(revoked.bodyAsText()).jsonObject
        assertEquals(firstId, revokedJson.getValue("id").jsonPrimitive.content)
        revokedJson.getValue("revokedAt").jsonPrimitive.content

        val revokedCheck = postJson("/api/vehicle-checks", """{"registrationNumber":"AB12345"}""")
        assertEquals(
            "REVOKED",
            Json.parseToJsonElement(revokedCheck.bodyAsText()).jsonObject
                .getValue("approvalStatus").jsonPrimitive.content,
        )

        val second = postJson(
            "/api/vehicle-approvals",
            """{"approvals":[{"registrationNumber":"AB12345","expiryDate":"2099-12-31"}]}""",
        )
        val secondId = Json.parseToJsonElement(second.bodyAsText()).jsonObject
            .getValue("approvals").jsonArray.single().jsonObject.getValue("id").jsonPrimitive.content
        assertNotEquals(firstId, secondId)
    }

    private suspend fun io.ktor.server.testing.ApplicationTestBuilder.postJson(path: String, body: String) =
        client.post(path) {
            headers { append(HttpHeaders.ContentType, "application/json") }
            setBody(body)
        }

    private fun testRepository() = VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db"))
}
