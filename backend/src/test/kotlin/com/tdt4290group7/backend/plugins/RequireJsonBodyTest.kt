package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class RequireJsonBodyTest {
    private fun statusFor(type: ContentType?, body: String): HttpStatusCode {
        var status = HttpStatusCode.OK
        testApplication {
            application {
                module(VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db")), null, Duration.ofDays(14))
            }
            status = adminClient().post("/api/vehicle-checks") {
                if (type != null) contentType(type)
                setBody(body)
            }.status
        }
        return status
    }

    @Test
    fun rejectsTextPlainAndFormBodies() {
        assertEquals(HttpStatusCode.UnsupportedMediaType, statusFor(ContentType.Text.Plain, """{"registrationNumber":"AB12345"}"""))
        assertEquals(HttpStatusCode.UnsupportedMediaType, statusFor(ContentType.Application.FormUrlEncoded, "a=b"))
    }

    @Test
    fun acceptsJsonBodies() {
        assertNotEquals(HttpStatusCode.UnsupportedMediaType, statusFor(ContentType.Application.Json, """{"registrationNumber":"AB12345"}"""))
    }
}
