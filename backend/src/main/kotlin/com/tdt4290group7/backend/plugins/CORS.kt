package com.tdt4290group7.backend.plugins

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.cors.routing.CORS
import java.net.URI

/** A browser origin allowed to call the API, e.g. `https://app.example.no` or `http://localhost:3000`. */
data class AllowedOrigin(val scheme: String, val hostWithPort: String)

fun Application.configureCORS() {
    val allowedOrigins = parseAllowedOrigins(
        System.getenv("CORS_ALLOWED_ORIGINS")
            // Falls back to the default Vite dev server origin so `npm run dev` works against
            // a locally running backend without extra setup; set CORS_ALLOWED_ORIGINS explicitly
            // everywhere else (e.g. Docker, staging, production).
            ?.takeIf { it.isNotBlank() }
            ?: "http://localhost:5173"
    )

    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowHeader(HttpHeaders.ContentType)
        // Lets the browser send the HttpOnly auth cookie on cross-origin API calls. Requests
        // from origins outside the allowlist are rejected with 403, which also blocks CSRF.
        allowCredentials = true
        allowedOrigins.forEach { origin ->
            // Only the configured scheme: an https origin must not also be reachable over http.
            allowHost(origin.hostWithPort, schemes = listOf(origin.scheme))
        }
    }
}

/**
 * Parses a comma-separated list of full origins (`scheme://host[:port]`). Entries without a
 * scheme are rejected rather than guessed, so a plain-http origin is always a deliberate choice.
 */
fun parseAllowedOrigins(raw: String): List<AllowedOrigin> {
    val origins = raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }.map { entry ->
        val uri = runCatching { URI(entry) }.getOrNull()
        val scheme = uri?.scheme?.lowercase()
        require(uri != null && (scheme == "http" || scheme == "https") && !uri.host.isNullOrEmpty() &&
            uri.rawPath.isNullOrEmpty() && uri.rawQuery == null && uri.rawFragment == null && uri.rawUserInfo == null
        ) {
            "CORS_ALLOWED_ORIGINS entry '$entry' must be a full origin like https://app.example.no " +
                "or http://localhost:3000 (scheme, host, optional port; no path)"
        }
        AllowedOrigin(scheme, if (uri.port == -1) uri.host else "${uri.host}:${uri.port}")
    }
    require(origins.isNotEmpty()) { "CORS_ALLOWED_ORIGINS must list at least one origin" }
    return origins
}
