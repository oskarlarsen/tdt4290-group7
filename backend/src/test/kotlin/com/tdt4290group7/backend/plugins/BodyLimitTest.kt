package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.module
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import io.ktor.utils.io.ByteReadChannel
import kotlin.test.Test
import kotlin.test.assertEquals

class BodyLimitTest {
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
