package com.tdt4290group7.backend.routes

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.tdt4290group7.backend.plugins.configureRateLimiting
import com.tdt4290group7.backend.plugins.configureSecurity
import com.tdt4290group7.backend.plugins.configureSerialization
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.slf4j.LoggerFactory

class ResetTokenLoggingTest {
    /** Requests a reset for a seeded account and returns everything AuthRoutes logged meanwhile. */
    private fun logsForResetRequest(logResetTokens: Boolean): List<String> {
        val logger = LoggerFactory.getLogger("AuthRoutes") as Logger
        val appender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(appender)
        try {
            testApplication {
                application {
                    configureSerialization()
                    configureSecurity()
                    configureRateLimiting()
                    configureAuthRoutes(logResetTokens)
                }
                val response = client.post("/api/auth/forgot-password") {
                    contentType(ContentType.Application.Json)
                    setBody("""{"email":"advisor.hansen@kommune.no"}""")
                }
                assertEquals(HttpStatusCode.OK, response.status)
            }
        } finally {
            logger.detachAppender(appender)
        }
        return appender.list.map { it.formattedMessage }
    }

    @Test
    fun `tokens are not logged by default`() {
        val logs = logsForResetRequest(logResetTokens = false)
        assertFalse(logs.any { "password reset token" in it }, "token leaked: $logs")
        assertTrue(logs.any { "no delivery channel configured" in it })
    }

    @Test
    fun `tokens are logged when explicitly enabled`() {
        val logs = logsForResetRequest(logResetTokens = true)
        assertTrue(logs.any { it.startsWith("DEV-ONLY: password reset token for advisor.hansen@kommune.no") })
    }
}
