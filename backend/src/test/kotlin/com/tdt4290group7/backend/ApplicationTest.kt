package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.AppendTripRowsRequest
import com.tdt4290group7.backend.vehicles.syntheticTrip
import kotlinx.serialization.encodeToString
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.parseServerSetCookieHeader
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.time.Duration
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class ApplicationTest {
    @Test
    fun cookieAuthenticationAndVehicleRoutesCoexist() = testApplication {
        application { module(testRepository(), null, Duration.ofDays(14)) }
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/auth/me").status)

        val login = postJson(
            "/api/auth/login",
            """{"email":"advisor.hansen@kommune.no","password":"test-only-admin-password"}""",
        )
        assertEquals(HttpStatusCode.OK, login.status)
        val authCookie = parseServerSetCookieHeader(login.headers.getAll(HttpHeaders.SetCookie)!!.single())
        assertEquals("auth_token", authCookie.name)
        assertEquals(HttpStatusCode.OK, client.get("/api/auth/me") {
            cookie(authCookie.name, authCookie.value)
        }.status)
        assertEquals(HttpStatusCode.Created,
            postJson("/api/vehicle-checks", """{"registrationNumber":"AB12345"}""").status,
        )

        val logout = client.post("/api/auth/logout") {
            cookie(authCookie.name, authCookie.value)
        }
        assertEquals(HttpStatusCode.OK, logout.status)
        assertTrue(logout.headers.getAll(HttpHeaders.SetCookie)!!.single().contains("Max-Age=0"))
    }

    @Test
    fun busyVehicleWriteReturns503WithoutPersistingAnyBatchRows() = testApplication {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.db")
        val repository = VehicleRepository(path)
        application { module(repository, null, Duration.ofDays(14)) }
        startApplication()
        val body = Json.encodeToString(AppendTripRowsRequest(rows = listOf(syntheticTrip("AB12345"), syntheticTrip("CD12345"))))

        databaseConnection(path).use { blocker ->
            blocker.createStatement().use { it.execute("BEGIN IMMEDIATE") }
            try {
                val response = postJson("/api/trip-rows", body)
                assertEquals(HttpStatusCode.ServiceUnavailable, response.status)
                assertEquals(
                    """{"error":"Kjøretøydatabasen er opptatt. Prøv igjen senere"}""",
                    response.bodyAsText(),
                )
            } finally {
                blocker.createStatement().use { it.execute("ROLLBACK") }
            }
        }
        databaseConnection(path).use { db ->
            assertEquals(0, countRows(db, "vehicles"))
            assertEquals(0, countRows(db, "trip_rows"))
        }
        assertEquals(HttpStatusCode.Created, postJson("/api/trip-rows", body).status)
    }

    @Test
    fun otherSqlFailuresReturn500AndRollBackEarlierBatchWrites() = testApplication {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.db")
        val repository = VehicleRepository(path)
        databaseConnection(path).use { db ->
            db.createStatement().use { statement ->
                statement.executeUpdate(
                    """CREATE TRIGGER reject_second_synthetic_approval BEFORE INSERT ON trip_rows
                        WHEN NEW.registration_number = 'CD12345'
                        BEGIN SELECT RAISE(ABORT, 'synthetic test failure'); END""",
                )
            }
        }
        application { module(repository, null, Duration.ofDays(14)) }

        val response = postJson(
            "/api/trip-rows",
            Json.encodeToString(AppendTripRowsRequest(rows = listOf(syntheticTrip("AB12345"), syntheticTrip("CD12345")))),
        )
        assertEquals(HttpStatusCode.InternalServerError, response.status)
        assertEquals("Intern serverfeil", response.bodyAsText())
        databaseConnection(path).use { db ->
            assertEquals(0, countRows(db, "vehicles"))
            assertEquals(0, countRows(db, "trip_rows"))
        }
    }

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
            Json.encodeToString(AppendTripRowsRequest("trip-sheet", listOf(
                syntheticTrip("AB 12345", totalTripKm = "45.5".toBigDecimal()),
                syntheticTrip("AB12345", totalTripKm = "62".toBigDecimal()),
            ))),
        )
        assertEquals(HttpStatusCode.Created, trips.status)
        val tripResponse = Json.parseToJsonElement(trips.bodyAsText()).jsonObject
        assertEquals("2", tripResponse.getValue("rowCount").jsonPrimitive.content)
        assertEquals("1", tripResponse.getValue("distinctVehicleCount").jsonPrimitive.content)

        val check = postJson(
            "/api/vehicle-checks",
            """{"registrationNumber":"AB-12345"}""",
        )
        assertEquals(HttpStatusCode.Created, check.status)
        val checked = Json.parseToJsonElement(check.bodyAsText()).jsonObject
        assertEquals("AB12345", checked.getValue("vehicle").jsonObject
            .getValue("registrationNumber").jsonPrimitive.content)
        assertEquals(2, checked.getValue("tripRows").jsonArray.size)
        assertEquals("UNAVAILABLE", checked.getValue("registry").jsonObject
            .getValue("dataSource").jsonPrimitive.content)
        assertEquals("NOT_CONFIGURED", checked.getValue("registry").jsonObject
            .getValue("lookupOutcome").jsonPrimitive.content)

        val id = checked.getValue("id").jsonPrimitive.content
        val saved = adminClient().get("/api/vehicle-checks/$id")
        assertEquals(HttpStatusCode.OK, saved.status)
        assertEquals(checked, Json.parseToJsonElement(saved.bodyAsText()).jsonObject)
    }

    private suspend fun io.ktor.server.testing.ApplicationTestBuilder.postJson(path: String, body: String) =
        (if (path.startsWith("/api/auth/")) client else adminClient()).post(path) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }

    @Test
    fun strictTripContractReturnsNumericReadOnlyEstimateAndRejectsLegacyFieldsAtomically() = testApplication {
        val path = Path.of("build", "test-data", UUID.randomUUID().toString() + ".db")
        val repository = VehicleRepository(path)
        application { module(repository, null, Duration.ofDays(14)) }
        val valid = Json.encodeToString(syntheticTrip(co2GramsPerKm = "123.456789".toBigDecimal(),
            totalTripKm = "1000".toBigDecimal(), totalKmNoxRegistered = "1000".toBigDecimal(),
            totalNoxRegisteredGrams = "25.67".toBigDecimal(), averageFuelConsumptionLitresPer100Km = "0.08".toBigDecimal(),
            fuelConsumedLitres = "80".toBigDecimal()))
        listOf(
            """{"registrationNumber":"CD12345"}""",
            valid.replace("2026-01-31", "2026-02-30"),
            valid.replace("123.456789", """"123.456789""""),
            valid.replace("1000", "-1"),
            valid.replace("fuelTechnology", "fuel"),
            valid.dropLast(1) + ""","additionalFields":{}}""",
            valid.dropLast(1) + ""","estimatedCo2Kg":123}""",
            valid.dropLast(1) + ""","tripCount":"3"}""",
            valid.dropLast(1) + ""","co2Registered":"true"}""",
        ).forEach { invalid ->
            assertEquals(HttpStatusCode.BadRequest, postJson("/api/trip-rows", """{"rows":[$valid,$invalid]}""").status)
        }
        assertTrue(repository.tripRowsForVehicle("AB12345").isEmpty())
        val response = postJson("/api/trip-rows", """{"rows":[$valid]}""")
        assertEquals(HttpStatusCode.Created, response.status)
        val row = Json.parseToJsonElement(response.bodyAsText()).jsonObject.getValue("rows").jsonArray.single().jsonObject
        val estimate = row.getValue("estimatedCo2Kg").jsonPrimitive
        assertEquals(false, estimate.isString)
        assertEquals("123.456789", estimate.content)
        val check = postJson("/api/vehicle-checks", """{"registrationNumber":"AB12345"}""")
        val checked = Json.parseToJsonElement(check.bodyAsText()).jsonObject
        assertEquals(false, "id" in checked.getValue("vehicle").jsonObject)
        assertEquals("AB12345", checked.getValue("vehicle").jsonObject.getValue("registrationNumber").jsonPrimitive.content)
        val id = checked.getValue("id").jsonPrimitive.content
        assertEquals(checked, Json.parseToJsonElement(adminClient().get("/api/vehicle-checks/$id").bodyAsText()).jsonObject)
    }

    private fun testRepository() = VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db"))

    private fun databaseConnection(path: Path): Connection =
        DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}")

    private fun countRows(db: Connection, table: String): Int = db.createStatement().use { statement ->
        statement.executeQuery("SELECT COUNT(*) FROM $table").use { rows ->
            check(rows.next())
            rows.getInt(1)
        }
    }
}
