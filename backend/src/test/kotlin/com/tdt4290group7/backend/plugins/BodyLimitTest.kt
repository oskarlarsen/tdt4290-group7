package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.vehicles.VehicleRepository
import com.tdt4290group7.backend.vehicles.AppendTripRowsRequest
import com.tdt4290group7.backend.vehicles.syntheticTrip
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import io.ktor.utils.io.ByteReadChannel
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class BodyLimitTest {
    private fun vehicleStatusFor(path: String, body: String, chunked: Boolean = false): HttpStatusCode {
        var status = HttpStatusCode.OK
        testApplication {
            application {
                module(
                    VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db")),
                    null,
                    Duration.ofDays(14),
                )
            }
            status = adminClient().post(path) {
                contentType(ContentType.Application.Json)
                if (chunked) setBody(ByteReadChannel(body.toByteArray())) else setBody(body)
            }.status
        }
        return status
    }

    @Test
    fun `vehicle batches can exceed the small request limit`() {
        val padding = "a".repeat(MAX_REQUEST_BODY_BYTES.toInt())
        for (chunked in listOf(false, true)) {
            assertEquals(HttpStatusCode.Created, vehicleStatusFor(
                "/api/trip-rows",
                Json.encodeToString(AppendTripRowsRequest(rows = listOf(syntheticTrip(comment = padding)))),
                chunked,
            ))

        }
    }

    @Test
    fun `vehicle batches reject oversized bodies including chunked uploads`() {
        val padding = "a".repeat(MAX_VEHICLE_BATCH_BODY_BYTES.toInt())
        for (chunked in listOf(false, true)) {
            for (path in listOf("/api/trip-rows")) {
                assertEquals(HttpStatusCode.PayloadTooLarge,
                    vehicleStatusFor(path, """{"sourceName":"$padding"}""", chunked),
                )
            }
        }
    }

    @Test
    fun `single vehicle routes retain the small request limit`() {
        val padding = "a".repeat(MAX_REQUEST_BODY_BYTES.toInt())
        for (path in listOf("/api/vehicle-checks", "/api/vehicle-fleet/suppliers")) {
            assertEquals(HttpStatusCode.PayloadTooLarge,
                vehicleStatusFor(path, """{"registrationNumber":"$padding"}"""),
            )
        }
    }

    private fun statusFor(body: String, chunked: Boolean = false): HttpStatusCode {
        var status = HttpStatusCode.OK
        testApplication {
            application { module() }
            status = client.post("/api/auth/forgot-password") {
                contentType(ContentType.Application.Json)
                if (chunked) {
                    // A channel body has no Content-Length, so the limit must trip while reading
                    setBody(ByteReadChannel(body.toByteArray()))
                } else {
                    setBody(body)
                }
            }.status
        }
        return status
    }

    @Test
    fun `small body is accepted`() {
        assertEquals(HttpStatusCode.OK, statusFor("""{"email":"someone@example.no"}"""))
    }

    @Test
    fun `body over the limit is rejected with 413`() {
        val padding = "a".repeat(MAX_REQUEST_BODY_BYTES.toInt())
        assertEquals(HttpStatusCode.PayloadTooLarge, statusFor("""{"email":"$padding"}"""))
    }

    @Test
    fun `body over the limit without Content-Length is rejected with 413`() {
        val padding = "a".repeat(MAX_REQUEST_BODY_BYTES.toInt())
        assertEquals(HttpStatusCode.PayloadTooLarge, statusFor("""{"email":"$padding"}""", chunked = true))
    }

    @Test
    fun `malformed JSON is a 400, not a 500`() {
        assertEquals(HttpStatusCode.BadRequest, statusFor("{nope"))
    }
}
