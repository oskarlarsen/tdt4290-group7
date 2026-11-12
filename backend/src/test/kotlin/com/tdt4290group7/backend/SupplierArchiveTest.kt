package com.tdt4290group7.backend

import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.repository.createUserTables
import com.tdt4290group7.backend.vehicles.AgreementInput
import com.tdt4290group7.backend.vehicles.ArchivedSupplierMatchException
import com.tdt4290group7.backend.vehicles.ChangeActor
import com.tdt4290group7.backend.vehicles.FleetConflictException
import com.tdt4290group7.backend.vehicles.SupplierInput
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class SupplierArchiveTest {
    private val actor = ChangeActor("admin", "Administrator")

    private fun file() = Path.of("build", "test-data", "archive-${UUID.randomUUID()}.db")
    private fun connect(path: Path): Connection = DriverManager.getConnection("jdbc:sqlite:$path?foreign_keys=true")
    private fun scalar(db: Connection, sql: String) = db.createStatement().use { it.executeQuery(sql).use { rows -> rows.next(); rows.getString(1) } }

    @Test
    fun removingASupplierBlocksItsAccountsInTheSameTransactionAndTheSupplierCanComeBack() {
        val path = file()
        val vehicles = VehicleRepository(path)
        connect(path).use { db ->
            createUserTables(db)
            db.createStatement().use {
                it.executeUpdate("INSERT INTO users (id, name, email, password_hash, role, is_permanent) VALUES ('admin', 'Admin', 'a@example.com', 'x', 'ADMIN', 1)")
            }
        }
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Returning Transport AS", "987654321"), actor, Instant.now())
        vehicles.fleet.saveAgreement(null, AgreementInput(supplier.id, "2020-01-01", "2021-12-31", 3, saksnr = "2020/1"), null, actor, Instant.now())
        connect(path).use { db ->
            db.createStatement().use {
                it.executeUpdate("INSERT INTO users (id, name, email, password_hash, role, supplier_id) VALUES ('u1', 'Contact', 'c@example.com', 'x', 'SUPPLIER', '${supplier.id}')")
                it.executeUpdate("INSERT INTO supplier_invitations (id, email, supplier_id, supplier_name, token_hash, created_at, expires_at) VALUES ('i1', 'new@example.com', '${supplier.id}', 'n', 'h', 'c', 'e')")
            }
        }

        vehicles.fleet.removeSupplier(supplier.id, supplier.updatedAt!!, actor, Instant.now())

        connect(path).use { db ->
            assertNotNull(scalar(db, "SELECT access_expires_at FROM users WHERE id = 'u1'"), "the supplier's account must be blocked")
            assertNull(scalar(db, "SELECT access_expires_at FROM users WHERE id = 'admin'"), "other accounts are untouched")
            assertEquals("0", scalar(db, "SELECT count(*) FROM supplier_invitations"), "open invitations are dropped")
        }
        val archived = vehicles.fleet.archive().suppliers.single()
        assertEquals(supplier.id, archived.supplier.id)
        assertFalse(archived.supplier.active)
        assertNotNull(archived.archivedAt)
        assertEquals(1, archived.agreements.size, "the old agreement stays visible")
        assertTrue(vehicles.fleet.overview().suppliers.isEmpty())

        // The same organization number comes back: ask instead of failing, and say what was there before.
        val match = assertFailsWith<ArchivedSupplierMatchException> {
            vehicles.fleet.saveSupplier(null, SupplierInput("Returning Transport", "987654321"), actor, Instant.now())
        }.match
        assertEquals("ARCHIVED_SUPPLIER_MATCH", match.code)
        assertEquals(supplier.id, match.supplier.id)
        assertEquals(1, match.agreementCount)

        assertFailsWith<FleetConflictException> { vehicles.fleet.reactivateSupplier(supplier.id, "stale", actor, Instant.now()) }
        val back = vehicles.fleet.reactivateSupplier(archived.supplier.id, archived.supplier.updatedAt!!, actor, Instant.now())
        assertTrue(back.active)
        assertEquals(listOf(supplier.id), vehicles.fleet.overview().suppliers.map { it.id })
        assertTrue(vehicles.fleet.overview().agreements.isEmpty(), "old agreements stay archived; a new one is created")
        assertTrue(vehicles.fleet.archive().suppliers.isEmpty())
        connect(path).use { assertNotNull(scalar(it, "SELECT access_expires_at FROM users WHERE id = 'u1'"), "reactivating must not unblock accounts") }
        assertFailsWith<FleetConflictException> { vehicles.fleet.reactivateSupplier(supplier.id, back.updatedAt!!, actor, Instant.now()) }

        // The reactivation can be undone like any other change.
        val change = vehicles.fleet.history(1).first()
        assertTrue(change.description.startsWith("Reactivated supplier"))
        assertTrue(change.canUndo)
        vehicles.fleet.undo(change.id, actor, Instant.now())
        assertEquals(supplier.id, vehicles.fleet.archive().suppliers.single().supplier.id)
    }

    @Test
    fun archiveAndReactivateRoutesAreAdminOnlyAndTheMatchAnswerIsStructured() = testApplication {
        val vehicles = VehicleRepository(file())
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Route Transport AS", "246813579"), actor, Instant.now())
        vehicles.fleet.removeSupplier(supplier.id, supplier.updatedAt!!, actor, Instant.now())
        val active = vehicles.fleet.saveSupplier(null, SupplierInput("Active Transport AS", "135792468"), actor, Instant.now())
        application { module(vehicles, null) }
        val admin = adminClient()

        val archive = Json.parseToJsonElement(admin.get("/api/vehicle-fleet/archive").bodyAsText()).jsonObject.getValue("suppliers").jsonArray
        assertEquals(listOf(supplier.id), archive.map { it.jsonObject.getValue("supplier").jsonObject.getValue("id").jsonPrimitive.content })
        assertEquals(HttpStatusCode.Forbidden, supplierClient(active.id).get("/api/vehicle-fleet/archive").status)

        suspend fun addByNumber(org: String) = admin.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json); setBody("""{"name":"Whoever AS","orgNumber":"$org"}""")
        }
        val match = addByNumber("246813579")
        assertEquals(HttpStatusCode.Conflict, match.status)
        val body = Json.parseToJsonElement(match.bodyAsText()).jsonObject
        assertEquals("ARCHIVED_SUPPLIER_MATCH", body.getValue("code").jsonPrimitive.content)
        assertEquals(supplier.id, body.getValue("supplier").jsonObject.getValue("id").jsonPrimitive.content)
        // An active supplier with that number keeps the plain error.
        val plain = addByNumber("135792468")
        assertEquals(HttpStatusCode.Conflict, plain.status)
        assertFalse(plain.bodyAsText().contains("ARCHIVED_SUPPLIER_MATCH"))

        val archivedRow = body.getValue("supplier").jsonObject
        val reactivate = admin.post("/api/vehicle-fleet/suppliers/${supplier.id}/reactivate") {
            contentType(ContentType.Application.Json); setBody("""{"expectedUpdatedAt":"${archivedRow.getValue("updatedAt").jsonPrimitive.content}"}""")
        }
        assertEquals(HttpStatusCode.OK, reactivate.status, reactivate.bodyAsText())
        assertEquals(HttpStatusCode.Forbidden, supplierClient(active.id).post("/api/vehicle-fleet/suppliers/${supplier.id}/reactivate") {
            contentType(ContentType.Application.Json); setBody("""{"expectedUpdatedAt":"x"}""")
        }.status)
    }

    @Test
    fun anAdminCanInviteTheSameEmailAgainAfterTheAccountWasBlockedAndTheAccountIsReused() = testApplication {
        val vehicles = VehicleRepository(file())
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Reuse Transport AS", "112233445"), actor, Instant.now())
        val other = vehicles.fleet.saveSupplier(null, SupplierInput("Other Transport AS", "556677889"), actor, Instant.now())
        application { module(vehicles, null) }
        val admin = adminClient()
        val email = "returning-${UUID.randomUUID()}@example.com"

        suspend fun invite(supplierId: String, address: String = email) = admin.post("/api/vehicle-fleet/suppliers/$supplierId/invitations") {
            contentType(ContentType.Application.Json); setBody("""{"email":"$address"}""")
        }
        suspend fun accept(response: io.ktor.client.statement.HttpResponse, password: String) = client.post("/api/auth/accept-invitation") {
            contentType(ContentType.Application.Json)
            setBody("""{"token":"${Json.parseToJsonElement(response.bodyAsText()).jsonObject.getValue("token").jsonPrimitive.content}","newPassword":"$password"}""")
        }

        assertEquals(HttpStatusCode.OK, accept(invite(supplier.id), "first-password-1234").status)
        val user = UserRepository.findByEmail(email)!!
        // An active account still cannot be invited again.
        assertEquals(HttpStatusCode.Conflict, invite(supplier.id).status)

        // Block it the way an archived supplier does, then re-invite.
        UserRepository.revokeAccess(UserRepository.findByEmail("advisor.hansen@kommune.no")!!, user.id)
        assertEquals(HttpStatusCode.Conflict, invite(other.id).status, "a blocked account is not handed to another supplier")
        val again = invite(supplier.id)
        assertEquals(HttpStatusCode.Created, again.status, again.bodyAsText())
        assertEquals(HttpStatusCode.OK, accept(again, "second-password-1234").status)

        val reused = UserRepository.findByEmail(email)!!
        assertEquals(user.id, reused.id, "same account, not a new one")
        assertNull(reused.accessExpiresAt)
        assertTrue(reused.tokenVersion > user.tokenVersion, "sessions from before end")
        assertTrue(UserRepository.isAccessActive(reused))
    }

    @Test
    fun renamingASupplierUpdatesTheCopiesOfItsNameOnInvitationsAndAgreementCertificates() {
        val path = file()
        val vehicles = VehicleRepository(path)
        connect(path).use { createUserTables(it) }
        com.tdt4290group7.backend.certificates.CertificateRepository(path)
        val supplier = vehicles.fleet.saveSupplier(null, SupplierInput("Old Name AS", "314159265"), actor, Instant.now())
        val agreement = vehicles.fleet.saveAgreement(null, AgreementInput(supplier.id, "2026-01-01", "2026-12-31", 3, saksnr = "2026/9"), null, actor, Instant.now())
        connect(path).use { db ->
            db.createStatement().use {
                it.executeUpdate("INSERT INTO users (id, name, email, password_hash, role, is_permanent) VALUES ('x', 'Inviter', 'x@example.com', 'x', 'ADMIN', 1)")
                it.executeUpdate("INSERT INTO supplier_invitations (id, email, supplier_id, supplier_name, token_hash, created_at, expires_at) VALUES ('i1', 'a@example.com', '${supplier.id}', 'Old Name AS', 'h1', 'c', 'e')")
                it.executeUpdate("INSERT INTO access_invitations (id, email, role, supplier_id, supplier_name, token_hash, created_at, expires_at, invited_by) VALUES ('i2', 'b@example.com', 'SUPPLIER', '${supplier.id}', 'Old Name AS', 'h2', 'c', 'e', 'x')")
                it.executeUpdate("INSERT INTO certificates (id, supplier_name, certificate_type, source_file, contract_id) VALUES ('c1', 'Old Name AS', 'EURO6', 'c.pdf', '${agreement.id}')")
                it.executeUpdate("INSERT INTO certificates (id, supplier_name, certificate_type, source_file) VALUES ('c2', 'Typed By Hand', 'EURO6', 'c.pdf')")
            }
        }

        vehicles.fleet.saveSupplier(supplier.id, SupplierInput("New Name AS", "314159265"), actor, Instant.now(), supplier.updatedAt)

        connect(path).use { db ->
            assertEquals("New Name AS", scalar(db, "SELECT supplier_name FROM supplier_invitations WHERE id = 'i1'"))
            assertEquals("New Name AS", scalar(db, "SELECT supplier_name FROM access_invitations WHERE id = 'i2'"))
            assertEquals("New Name AS", scalar(db, "SELECT supplier_name FROM certificates WHERE id = 'c1'"))
            assertEquals("Typed By Hand", scalar(db, "SELECT supplier_name FROM certificates WHERE id = 'c2'"), "a certificate without an agreement has a free-text name")
        }
    }

    @Test
    fun anArchivedSupplierWithTheSameNameButAnotherNumberIsAskedAboutOnceAndCanBeOverruled() {
        val vehicles = VehicleRepository(file())
        val old = vehicles.fleet.saveSupplier(null, SupplierInput("Samme Navn AS", "111111111"), actor, Instant.now())
        vehicles.fleet.removeSupplier(old.id, old.updatedAt!!, actor, Instant.now())

        val warning = assertFailsWith<ArchivedSupplierMatchException> {
            vehicles.fleet.saveSupplier(null, SupplierInput("samme navn as", "222222222"), actor, Instant.now())
        }.match
        assertEquals("ARCHIVED_SUPPLIER_NAME_MATCH", warning.code)
        assertEquals(old.id, warning.supplier.id)
        assertEquals("111111111", warning.supplier.orgNumber)

        // "No, this is a new supplier": the same request, confirmed, creates it.
        val created = vehicles.fleet.saveSupplier(null, SupplierInput("samme navn as", "222222222", confirmNewSupplier = true), actor, Instant.now())
        assertEquals("222222222", created.orgNumber)
        // The organization number is the stronger match: it still asks, whatever the name says.
        assertEquals("ARCHIVED_SUPPLIER_MATCH", assertFailsWith<ArchivedSupplierMatchException> {
            vehicles.fleet.saveSupplier(null, SupplierInput("Anything", "111111111", confirmNewSupplier = true), actor, Instant.now())
        }.match.code)
    }

    @Test
    fun theNameWarningIsAnswered409ByTheRouteAndAConfirmedRequestCreatesTheSupplier() = testApplication {
        val vehicles = VehicleRepository(file())
        val old = vehicles.fleet.saveSupplier(null, SupplierInput("Route Samme AS", "121212121"), actor, Instant.now())
        vehicles.fleet.removeSupplier(old.id, old.updatedAt!!, actor, Instant.now())
        application { module(vehicles, null) }
        val admin = adminClient()
        suspend fun add(extra: String = "") = admin.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json); setBody("""{"name":"Route Samme AS","orgNumber":"343434343"$extra}""")
        }
        val warning = add()
        assertEquals(HttpStatusCode.Conflict, warning.status)
        assertEquals("ARCHIVED_SUPPLIER_NAME_MATCH", Json.parseToJsonElement(warning.bodyAsText()).jsonObject.getValue("code").jsonPrimitive.content)
        assertEquals(HttpStatusCode.Created, add(""","confirmNewSupplier":true""").status)
    }
}
