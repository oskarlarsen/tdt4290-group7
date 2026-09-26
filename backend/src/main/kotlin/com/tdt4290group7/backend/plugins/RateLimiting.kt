package com.tdt4290group7.backend.plugins

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import kotlin.time.Duration.Companion.minutes

val LOGIN_RATE_LIMIT = RateLimitName("login")

/** Blunt brute-force protection: caps login attempts per client IP. */
fun Application.configureRateLimiting() {
    install(RateLimit) {
        register(LOGIN_RATE_LIMIT) {
            rateLimiter(limit = 10, refillPeriod = 1.minutes)
            requestKey { call -> call.request.origin.remoteHost }
        }
    }
}
