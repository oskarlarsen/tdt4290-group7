package com.tdt4290group7.backend

import com.tdt4290group7.backend.auth.AuthCookie
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.cookie
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class AccessRoutesTest {
    @Test
    fun aSupplierInvitesAStandInWhoLosesAccessWhenRemoved() = testApplication {
        val vehicles = VehicleRepository(Path.of("build", "test-data", "access-${UUID.randomUUID()}.db"))
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Access AS", "123456789"), ChangeActor("a", "Admin"), Instant.now())
        application { module(vehicles, null) }
        val owner = supplierClient(supplier.id)
        val admin = adminClient()
        val end = LocalDate.now(ZoneId.of("Europe/Oslo")).plusDays(30).toString()
        val email = "standin-${UUID.randomUUID()}@example.no"

        val invited = owner.post("/api/supplier/colleagues/invitations") { contentType(ContentType.Application.Json); setBody("""{"email":"$email","accessEndDate":"$end"}""") }
        assertEquals(HttpStatusCode.Created, invited.status, invited.bodyAsText())
        val token = Json.parseToJsonElement(invited.bodyAsText()).jsonObject.getValue("token").jsonPrimitive.content
        // The organization comes from the login: a colleague cannot be invited into another one, and admins use their own route.
        assertEquals(HttpStatusCode.Forbidden, admin.post("/api/supplier/colleagues/invitations") { contentType(ContentType.Application.Json); setBody("""{"email":"a@example.no"}""") }.status)
        assertEquals(HttpStatusCode.BadRequest, owner.post("/api/supplier/colleagues/invitations") { contentType(ContentType.Application.Json); setBody("""{"email":"b@example.no","accessEndDate":"2999-01-01"}""") }.status)
        assertEquals(HttpStatusCode.Forbidden, owner.post("/api/admin/team/invitations") { contentType(ContentType.Application.Json); setBody("""{"email":"c@example.no"}""") }.status)

        val noName = client.post("/api/auth/accept-invitation") { contentType(ContentType.Application.Json); setBody("""{"token":"$token","newPassword":"test-only-supplier-password"}""") }
        assertEquals(HttpStatusCode.BadRequest, noName.status)
        assertEquals(HttpStatusCode.OK, client.post("/api/auth/accept-invitation") { contentType(ContentType.Application.Json); setBody("""{"token":"$token","newPassword":"test-only-supplier-password","name":"Kari Vikar"}""") }.status)

        val standIn = UserRepository.findByEmail(email)!!
        val standInClient = createClient { defaultRequest { cookie(AuthCookie.NAME, JwtConfig.generateToken(standIn, false).first) } }
        assertEquals(HttpStatusCode.OK, standInClient.get("/api/auth/me").status)

        // Suppliers see only their own organization; admins see everyone, including who granted what.
        val ownList = Json.parseToJsonElement(owner.get("/api/access").bodyAsText()).jsonArray.map { it.jsonObject }
        assertEquals(true, ownList.all { it.getValue("supplierId").jsonPrimitive.content == supplier.id })
        val entry = ownList.single { it.getValue("email").jsonPrimitive.content == email }
        assertEquals("Kari Vikar", entry.getValue("name").jsonPrimitive.content)
        assertEquals(true, Json.parseToJsonElement(admin.get("/api/access").bodyAsText()).jsonArray.size > ownList.size)

        // Only the granter or an admin can remove access, and it takes effect on the very next request.
        val id = entry.getValue("id").jsonPrimitive.content
        assertEquals(HttpStatusCode.BadRequest, standInClient.post("/api/access/$id/revoke").status)
        assertEquals(HttpStatusCode.NoContent, owner.post("/api/access/$id/revoke").status)
        assertEquals(HttpStatusCode.Unauthorized, standInClient.get("/api/auth/me").status)
        assertEquals(HttpStatusCode.Forbidden, owner.post("/api/admin/access/$id/approve").status)
    }
}
