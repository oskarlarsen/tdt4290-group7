package com.tdt4290group7.backend.plugins

import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.plugins.cors.routing.CORS

fun Application.configureCORS() {
    val allowedOrigins = System.getenv("CORS_ALLOWED_ORIGINS")
        ?.split(",")
        ?.map { it.trim() }
        ?.filter { it.isNotEmpty() }
        // Falls back to the default Vite dev server origin so `npm run dev` works against
        // a locally running backend without extra setup; set CORS_ALLOWED_ORIGINS explicitly
        // everywhere else (e.g. Docker, staging, production).
        ?.takeIf { it.isNotEmpty() }
        ?: listOf("localhost:5173")

    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowedOrigins.forEach { host ->
            allowHost(host, schemes = listOf("http", "https"))
        }
    }
}
