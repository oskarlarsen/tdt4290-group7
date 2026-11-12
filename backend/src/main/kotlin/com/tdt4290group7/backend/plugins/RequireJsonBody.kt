package com.tdt4290group7.backend.plugins

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.application.install
import io.ktor.server.request.contentType
import io.ktor.server.request.header
import io.ktor.server.response.respond

private val BODY_METHODS = setOf(HttpMethod.Post, HttpMethod.Put, HttpMethod.Patch, HttpMethod.Delete)

/**
 * State-changing requests with a body must be JSON or multipart. A cross-site HTML form can only send
 * form-encoded or text/plain bodies without a CORS preflight, so this closes that route even for
 * handlers that read the raw text (SameSite=Strict already blocks it from other sites).
 */
private val RequireJsonBody = createApplicationPlugin("RequireJsonBody") {
    onCall { call ->
        val request = call.request
        if (request.local.method !in BODY_METHODS) return@onCall
        val hasBody = (request.header(HttpHeaders.ContentLength)?.toLongOrNull() ?: 0L) > 0L ||
            request.header(HttpHeaders.TransferEncoding) != null
        if (!hasBody) return@onCall
        val type = request.contentType()
        if (!type.match(ContentType.Application.Json) && !type.match(ContentType.MultiPart.FormData)) {
            call.respond(HttpStatusCode.UnsupportedMediaType, ApiError("Send JSON eller skjemadata (multipart)"))
        }
    }
}

fun Application.configureRequireJsonBody() {
    install(RequireJsonBody)
}
