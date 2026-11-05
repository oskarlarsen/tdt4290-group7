package com.tdt4290group7.backend

import com.tdt4290group7.backend.auth.AuthCookie
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.setBody
import io.ktor.client.request.cookie
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Use a signed real user cookie, keeping route tests independent of login rate limits. */
suspend fun ApplicationTestBuilder.adminClient(): HttpClient {
    startApplication()
    val user = UserRepository.findByEmail("advisor.hansen@kommune.no")!!
    val token = JwtConfig.generateToken(user, false).first
    return createClient { defaultRequest { cookie(AuthCookie.NAME, token) } }
}

suspend fun ApplicationTestBuilder.supplierClient(supplierId: String): HttpClient {
    startApplication()
    val email = "supplier-${UUID.randomUUID()}@example.no"
    val admin = adminClient()
    val inviteResponse = admin.post("/api/vehicle-fleet/suppliers/$supplierId/invitations") {
        contentType(ContentType.Application.Json)
        setBody("""{"email":"$email"}""")
    }
    check(inviteResponse.status == HttpStatusCode.Created) {
        "Could not create supplier test invitation: ${inviteResponse.bodyAsText()}"
    }
    val invitationToken = Json.parseToJsonElement(inviteResponse.bodyAsText()).jsonObject["token"]!!.jsonPrimitive.content
    val activationResponse = client.post("/api/auth/accept-invitation") {
        contentType(ContentType.Application.Json)
        setBody("""{"token":"$invitationToken","newPassword":"test-only-supplier-password"}""")
    }
    check(activationResponse.status == HttpStatusCode.OK) {
        "Could not activate supplier test account: ${activationResponse.bodyAsText()}"
    }
    val user = UserRepository.findByEmail(email)!!
    val token = JwtConfig.generateToken(user, false).first
    return createClient { defaultRequest { cookie(AuthCookie.NAME, token) } }
}
