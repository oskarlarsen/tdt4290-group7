package com.tdt4290group7.backend.plugins

import com.tdt4290group7.backend.backendSetting

import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.application.log
import io.ktor.server.plugins.forwardedheaders.XForwardedHeaders
import io.ktor.server.plugins.origin
import io.ktor.server.plugins.ratelimit.RateLimit
import io.ktor.server.plugins.ratelimit.RateLimitName
import kotlin.time.Duration.Companion.minutes

val LOGIN_RATE_LIMIT = RateLimitName("login")

/** Blunt brute-force protection: caps login attempts per client IP. */
fun Application.configureRateLimiting(trustedProxyHops: Int = trustedProxyHopsFromEnv()) {
    configureTrustedProxies(trustedProxyHops)

    install(RateLimit) {
        register(LOGIN_RATE_LIMIT) {
            rateLimiter(limit = 10, refillPeriod = 1.minutes)
            // remoteAddress is the IP as-is; remoteHost may trigger a reverse-DNS lookup per request.
            requestKey { call -> call.request.origin.remoteAddress }
        }
    }
}

/**
 * Behind a load balancer or ingress every request arrives from the proxy's IP, so all users would
 * share one rate-limit bucket. Set TRUSTED_PROXY_HOPS to the number of proxies in front of the
 * backend and the client IP is taken from X-Forwarded-For instead.
 *
 * Only the entries appended by those trusted proxies are used: anything further left is supplied
 * by the client and could be spoofed to dodge the limit. Leave it unset (0) when clients connect
 * directly, and make sure the backend is then reachable only through the proxies.
 */
private fun Application.configureTrustedProxies(hops: Int) {
    if (hops == 0) return

    install(XForwardedHeaders) {
        // X-Forwarded-For: <client-supplied...>, <client IP>, <proxy 1>, ..., <proxy hops-1>
        // The outermost trusted proxy appended the real client IP, hops-1 entries from the end.
        if (hops == 1) useLastProxy() else skipLastProxies(hops - 1)
    }
    log.info("Trusting $hops proxy hop(s) in X-Forwarded-For for client IPs")
}

private fun trustedProxyHopsFromEnv(): Int {
    val raw = backendSetting("TRUSTED_PROXY_HOPS") ?: return 0
    return requireNotNull(raw.trim().toIntOrNull()?.takeIf { it >= 0 }) {
        "TRUSTED_PROXY_HOPS must be a non-negative integer, was '$raw'"
    }
}
