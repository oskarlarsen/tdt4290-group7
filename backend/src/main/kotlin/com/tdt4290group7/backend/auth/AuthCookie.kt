package com.tdt4290group7.backend.auth

import com.tdt4290group7.backend.backendSetting

import io.ktor.http.HttpHeaders
import io.ktor.http.renderSetCookieHeader
import io.ktor.server.application.ApplicationCall
import io.ktor.util.date.GMTDate

/**
 * The JWT is delivered as an HttpOnly cookie so page scripts (and therefore XSS) can't read it.
 * SameSite=Strict plus the CORS origin allowlist protect the cookie-authenticated endpoints from
 * CSRF. This requires the frontend and the API to be served from the same site.
 */
object AuthCookie {
    const val NAME = "auth_token"
    private const val PATH = "/api"

    // Only disable for local http setups where the browser drops Secure cookies (e.g. Safari on
    // http://localhost). Chrome and Firefox accept Secure cookies on http://localhost.
    private val secure: Boolean = backendSetting("AUTH_COOKIE_SECURE")?.trim()?.lowercase() != "false"

    /** [maxAgeSeconds] null makes it a session cookie that the browser drops when it closes. */
    fun set(call: ApplicationCall, token: String, maxAgeSeconds: Long?) {
        append(call, token, maxAgeSeconds?.toInt())
    }

    fun clear(call: ApplicationCall) {
        append(call, "", maxAge = 0, expires = GMTDate.START)
    }

    private fun append(call: ApplicationCall, value: String, maxAge: Int?, expires: GMTDate? = null) {
        val header = renderSetCookieHeader(
            name = NAME,
            value = value,
            maxAge = maxAge,
            expires = expires,
            path = PATH,
            secure = secure,
            httpOnly = true,
            extensions = mapOf("SameSite" to "Strict"),
            // Otherwise Ktor adds a non-standard "$x-enc" attribute to the header.
            includeEncoding = false,
        )
        call.response.headers.append(HttpHeaders.SetCookie, header)
    }
}
