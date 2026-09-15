package com.tdt4290group7.backend.routes

import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.model.toAuthUser
import com.tdt4290group7.backend.plugins.AUTH_JWT
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.post
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import java.time.Instant
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("AuthRoutes")

@Serializable
data class LoginRequest(val email: String, val password: String, val rememberMe: Boolean = false)

@Serializable
data class LoginResponse(
    val token: String,
    val expiresAt: String,
    val user: com.tdt4290group7.backend.model.AuthUser,
)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ErrorResponse(val message: String)

fun Application.configureAuthRoutes() {
    routing {
        route("/api/auth") {
            post("/login") {
                val request = call.receive<LoginRequest>()
                val email = request.email.trim()

                if (email.isEmpty() || request.password.isEmpty()) {
                    call.respond(HttpStatusCode.BadRequest, ErrorResponse("Email and password are required."))
                    return@post
                }

                val user = UserRepository.findByEmail(email)
                // Same generic error whether the account doesn't exist or the password is
                // wrong, so the endpoint can't be used to enumerate valid accounts.
                if (user == null || !UserRepository.verifyPassword(user, request.password)) {
                    call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Invalid email/username or password."))
                    return@post
                }

                val (token, expiresAt) = JwtConfig.generateToken(user, request.rememberMe)
                call.respond(
                    LoginResponse(
                        token = token,
                        expiresAt = Instant.ofEpochMilli(expiresAt.time).toString(),
                        user = user.toAuthUser(),
                    )
                )
            }

            post("/forgot-password") {
                val request = call.receive<ForgotPasswordRequest>()
                // Always respond the same way regardless of whether the account exists,
                // so this endpoint can't be used to enumerate registered emails.
                logger.info("Password reset requested")
                call.respond(HttpStatusCode.OK)
            }

            authenticate(AUTH_JWT) {
                get("/me") {
                    val principal = call.principal<JWTPrincipal>()
                    val userId = principal?.payload?.let { JwtConfig.userId(it) }
                    val user = userId?.let { UserRepository.findById(it) }

                    if (user == null) {
                        call.respond(HttpStatusCode.Unauthorized)
                        return@get
                    }

                    call.respond(user.toAuthUser())
                }

                post("/logout") {
                    // Tokens are stateless JWTs with no server-side session, so there is
                    // nothing to invalidate server-side; the client discards the token.
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}
