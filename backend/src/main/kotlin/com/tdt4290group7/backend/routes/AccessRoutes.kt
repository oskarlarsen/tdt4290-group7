package com.tdt4290group7.backend.routes

import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.model.User
import com.tdt4290group7.backend.plugins.AUTH_JWT
import com.tdt4290group7.backend.plugins.ApiError
import com.tdt4290group7.backend.repository.AccountConflictException
import com.tdt4290group7.backend.repository.UserRepository
import com.tdt4290group7.backend.vehicles.FleetRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.application.log
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlinx.serialization.Serializable

@Serializable
data class AccessInvitationRequest(val email: String, val accessEndDate: String? = null, val supplierId: String? = null)

@Serializable
data class AccessInvitationResponse(val email: String, val token: String, val expiresAt: String, val accessExpiresAt: String? = null)

@Serializable
data class AccessEndRequest(val accessEndDate: String)

@Serializable
data class AccessEntryResponse(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val supplierId: String? = null,
    val grantedBy: String? = null,
    val accessExpiresAt: String? = null,
    val approved: Boolean,
    val permanent: Boolean,
    val active: Boolean,
    /** True for the caller's own account. */
    val isYou: Boolean,
)

@Serializable
data class PendingInvitationResponse(val email: String, val role: String, val supplierId: String? = null, val supplierName: String? = null, val expiresAt: String, val accessExpiresAt: String? = null, val contact: Boolean)

private fun ApplicationCall.signedIn(): User? =
    principal<JWTPrincipal>()?.payload?.let(JwtConfig::userId)?.let(UserRepository::findById)

private fun String?.toDate(): LocalDate? = try { this?.let(LocalDate::parse) } catch (_: DateTimeParseException) { throw IllegalArgumentException("Enter the end date as YYYY-MM-DD") }

/**
 * Who has access, and how it is given, renewed and ended. Suppliers manage colleagues in their own organization;
 * admins see and manage everyone. Every request already passed the access check, so ended access cannot reach these routes.
 */
fun Application.configureAccessRoutes(fleet: FleetRepository) {
    routing {
        authenticate(AUTH_JWT) {
            post("/api/supplier/colleagues/invitations") {
                val user = call.signedIn()
                val supplierId = user?.supplierId?.takeIf { user.role == Role.SUPPLIER }
                if (user == null || supplierId == null) return@post call.respond(HttpStatusCode.Forbidden, ApiError("Krever leverandørtilgang"))
                // The organization always comes from the login, never from the request.
                val supplier = fleet.overview().suppliers.firstOrNull { it.id == supplierId }
                    ?: return@post call.respond(HttpStatusCode.Forbidden, ApiError("Organisasjonen din er ikke aktiv"))
                call.invite(user, supplier.name)
            }

            post("/api/admin/team/invitations") {
                val user = call.signedIn()
                if (user == null || user.role != Role.ADMIN) return@post call.respond(HttpStatusCode.Forbidden, ApiError("Krever administratortilgang"))
                call.invite(user, null) { id -> fleet.overview().suppliers.firstOrNull { it.id == id }?.name }
            }

            get("/api/access") {
                val user = call.signedIn() ?: return@get call.respond(HttpStatusCode.Unauthorized)
                val entries = UserRepository.accessList(if (user.role == Role.ADMIN) null else user.supplierId)
                call.respond(entries.map {
                    AccessEntryResponse(it.id, it.name, it.email, it.role.name, it.supplierId, it.grantedByName, it.accessExpiresAt?.toString(), it.approved, it.permanent, it.active, it.id == user.id)
                })
            }

            get("/api/access/invitations") {
                val user = call.signedIn() ?: return@get call.respond(HttpStatusCode.Unauthorized)
                val pending = UserRepository.pendingInvitations(if (user.role == Role.ADMIN) null else user.supplierId)
                call.respond(pending.map { PendingInvitationResponse(it.email, it.role.name, it.supplierId, it.supplierName, it.expiresAt.toString(), it.accessExpiresAt?.toString(), it.contact) })
            }

            post("/api/access/{id}/renew") {
                val user = call.signedIn() ?: return@post call.respond(HttpStatusCode.Unauthorized)
                call.manage(user) { id -> UserRepository.renewAccess(user, id, call.receive<AccessEndRequest>().accessEndDate.toDate()!!) }
            }

            post("/api/access/{id}/revoke") {
                val user = call.signedIn() ?: return@post call.respond(HttpStatusCode.Unauthorized)
                call.manage(user) { id -> UserRepository.revokeAccess(user, id) }
            }

            post("/api/admin/access/{id}/approve") {
                val user = call.signedIn()
                if (user == null || user.role != Role.ADMIN) return@post call.respond(HttpStatusCode.Forbidden, ApiError("Krever administratortilgang"))
                call.manage(user) { id -> UserRepository.approveAccess(user, id) }
            }
        }
    }
}

private suspend fun ApplicationCall.invite(inviter: User, supplierName: String?, supplierNameFor: (String) -> String? = { null }) {
    val request = try { receive<AccessInvitationRequest>() } catch (_: Exception) { return respond(HttpStatusCode.BadRequest, ApiError("Ugyldig invitasjonsforespørsel")) }
    try {
        // Only the admin route passes a supplierId; it must name an active supplier organization.
        val targetId = request.supplierId?.takeIf { inviter.role == Role.ADMIN }
        val targetName = targetId?.let { supplierNameFor(it) ?: return respond(HttpStatusCode.NotFound, ApiError("Fant ikke en aktiv leverandørorganisasjon")) }
        val invitation = UserRepository.createAccessInvitation(inviter, request.email, targetName ?: supplierName, request.accessEndDate?.takeIf { it.isNotBlank() }.toDate(), supplierId = targetId)
        application.log.info("access_invitation_created inviterId={} role={} standIn={}", inviter.id, inviter.role, invitation.accessExpiresAt != null)
        respond(HttpStatusCode.Created, AccessInvitationResponse(request.email.trim(), invitation.token, invitation.expiresAt, invitation.accessExpiresAt))
    } catch (e: AccountConflictException) {
        respond(HttpStatusCode.Conflict, ApiError(e.message ?: "Det finnes allerede en konto"))
    } catch (e: IllegalArgumentException) {
        respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Ugyldig invitasjon"))
    }
}

private suspend fun ApplicationCall.manage(actor: User, action: suspend (String) -> Unit) {
    val id = parameters["id"] ?: return respond(HttpStatusCode.BadRequest)
    try {
        action(id)
        application.log.info("access_changed actorId={} targetId={} path={}", actor.id, id, request.local.uri.substringBefore('?'))
        respond(HttpStatusCode.NoContent)
    } catch (_: NoSuchElementException) {
        respond(HttpStatusCode.NotFound, ApiError("Fant ikke kontoen"))
    } catch (e: IllegalArgumentException) {
        respond(HttpStatusCode.BadRequest, ApiError(e.message ?: "Ugyldig forespørsel"))
    }
}
