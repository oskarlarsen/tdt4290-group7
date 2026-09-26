package com.tdt4290group7.backend

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals

class ApplicationTest {
    @Test
    fun testRootAndHealth() = testApplication {
        application {
            module()
        }

        val rootResponse = client.get("/")
        assertEquals(HttpStatusCode.OK, rootResponse.status)
        assertEquals("Hello World!", rootResponse.bodyAsText())

        val healthResponse = client.get("/health")
        assertEquals(HttpStatusCode.OK, healthResponse.status)
        assertEquals("""{"status":"UP"}""", healthResponse.bodyAsText())
    }
}
