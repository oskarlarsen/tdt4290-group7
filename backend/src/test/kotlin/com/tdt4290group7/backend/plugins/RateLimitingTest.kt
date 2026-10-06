package com.tdt4290group7.backend.plugins

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.server.plugins.origin
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class RateLimitingTest {
    // X-Forwarded-For as seen by the backend: a spoofed entry from the client, then the real
    // client IP appended by the outer proxy, then the outer proxy's IP appended by the inner one.
    private val forwardedFor = "6.6.6.6, 203.0.113.7, 10.0.0.2"

    private fun clientIpWith(hops: Int): String {
        var ip = ""
        testApplication {
            application {
                configureRateLimiting(trustedProxyHops = hops)
                routing { get("/ip") { call.respondText(call.request.origin.remoteAddress) } }
            }
            ip = client.get("/ip") { header("X-Forwarded-For", forwardedFor) }.bodyAsText()
        }
        return ip
    }

    @Test
    fun `without trusted proxies the header is ignored`() {
        assertEquals("localhost", clientIpWith(hops = 0))
    }

    @Test
    fun `one trusted proxy uses the last entry`() {
        assertEquals("10.0.0.2", clientIpWith(hops = 1))
    }

    @Test
    fun `two trusted proxies use the entry the outer proxy appended, never the spoofed one`() {
        assertEquals("203.0.113.7", clientIpWith(hops = 2))
    }
}
