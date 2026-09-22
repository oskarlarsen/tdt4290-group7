package com.tdt4290group7.backend.routes

import com.tdt4290group7.backend.auth.AuthCookie
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.auth.LoginAttemptTracker
import com.tdt4290group7.backend.auth.PasswordPolicy
import com.tdt4290group7.backend.model.toAuthUser
import com.tdt4290group7.backend.plugins.AUTH_JWT
import com.tdt4290group7.backend.plugins.LOGIN_RATE_LIMIT
import com.tdt4290group7.backend.repository.PasswordResetTokenStore
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.plugins.ratelimit.rateLimit
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.post
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import java.time.Instant
import kotlinx.serialization.Serializable
import org.slf4j.LoggerFactory

private val logger = LoggerFactory.getLogger("AuthRoutes")

// There is no email delivery yet, so the only way to get a reset token is to log it. That hands
// account takeover to anyone who can read the logs, so it must be explicitly opted into.
private val logResetTokens: Boolean = System.getenv("ALLOW_DEV_PASSWORD_RESET_LOG") == "true"

@Serializable
data class LoginRequest(val email: String, val password: String, val rememberMe: Boolean = false)

@Serializable
data class LoginResponse(
    // The token itself is only sent as an HttpOnly cookie, never in the body.
    val expiresAt: String,
    val user: com.tdt4290group7.backend.model.AuthUser,
)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ResetPasswordRequest(val token: String, val newPassword: String)

@Serializable
data class ErrorResponse(val message: String)

fun Application.configureAuthRoutes() {
    if (logResetTokens) {
        logger.warn(
            "ALLOW_DEV_PASSWORD_RESET_LOG=true: password reset tokens will be written to the log. " +
                "Never enable this outside local development."
        )
    }

    routing {
        route("/api/auth") {
            // Applies to login and forgot-password: blunt brute-force / enumeration protection.
            rateLimit(LOGIN_RATE_LIMIT) {
                post("/login") {
                    val request = call.receive<LoginRequest>()
                    val email = request.email.trim()

                    if (email.isEmpty() || request.password.isEmpty()) {
                        call.respond(HttpStatusCode.BadRequest, ErrorResponse("Email and password are required."))
                        return@post
                    }

                    // Checked before the password, so a locked account gives no signal about
                    // whether a guess was right.
                    LoginAttemptTracker.lockedFor(email)?.let { remaining ->
                        val seconds = maxOf(1, remaining.toSeconds() + if (remaining.toNanosPart() > 0) 1 else 0)
                        val minutes = (seconds + 59) / 60
                        call.response.header(HttpHeaders.RetryAfter, seconds.toString())
                        call.respond(
                            HttpStatusCode.TooManyRequests,
                            ErrorResponse(
                                "Too many failed sign-in attempts. Try again in " +
                                    if (minutes <= 1) "a minute." else "$minutes minutes."
                            )
                        )
                        return@post
                    }

                    val user = UserRepository.findByEmail(email)
                    // Same generic error whether the account doesn't exist or the password is
                    // wrong, so the endpoint can't be used to enumerate valid accounts.
                    if (user == null || !UserRepository.verifyPassword(user, request.password)) {
                        LoginAttemptTracker.recordFailure(email)
                        call.respond(HttpStatusCode.Unauthorized, ErrorResponse("Invalid email/username or password."))
                        return@post
                    }
                    LoginAttemptTracker.recordSuccess(email)

                    val (token, expiresAt) = JwtConfig.generateToken(user, request.rememberMe)
                    // Without "remember me" the cookie lasts until the browser closes (the JWT
                    // itself still expires after a day).
                    AuthCookie.set(call, token, if (request.rememberMe) JwtConfig.longLivedMillis / 1000 else null)
                    call.respond(
                        LoginResponse(
                            expiresAt = Instant.ofEpochMilli(expiresAt.time).toString(),
                            user = user.toAuthUser(),
                        )
                    )
                }

                post("/forgot-password") {
                    val request = call.receive<ForgotPasswordRequest>()
                    val user = UserRepository.findByEmail(request.email)
                    if (user != null) {
                        val token = PasswordResetTokenStore.create(user.id)
                        if (logResetTokens) {
                            logger.warn(
                                "DEV-ONLY: password reset token for ${user.email}: $token (valid 15 min)"
                            )
                        } else {
                            logger.info("Password reset requested for user ${user.id}; no delivery channel configured")
                        }
                    }
                    // Always respond the same way regardless of whether the account exists,
                    // so this endpoint can't be used to enumerate registered emails.
                    call.respond(HttpStatusCode.OK)
                }

                post("/reset-password") {
                    val request = call.receive<ResetPasswordRequest>()

                    // Validated before the single-use token is spent, so a rejected password
                    // doesn't force the user to request a new token.
                    PasswordPolicy.violation(request.newPassword)?.let { reason ->
                        call.respond(HttpStatusCode.BadRequest, ErrorResponse(reason))
                        return@post
                    }

                    // Single-use: the token is consumed even if the user lookup fails.
                    val user = PasswordResetTokenStore.consume(request.token.trim())
                        ?.let(UserRepository::findById)

                    if (user == null) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ErrorResponse("Invalid or expired reset code. Request a new one.")
                        )
                        return@post
                    }

                    UserRepository.updatePassword(user, request.newPassword)
                    // The account owner proved control of it, so lift any brute-force lock.
                    LoginAttemptTracker.recordSuccess(user.email)
                    logger.info("Password reset completed for user ${user.id}")
                    call.respond(HttpStatusCode.OK)
                }
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
            }

            // Outside `authenticate` so an expired or invalid cookie can still be cleared.
            post("/logout") {
                // The JWT is stateless, so clearing the cookie is all logout does; a copied
                // token stays valid until it expires or the password is changed.
                AuthCookie.clear(call)
                call.respond(HttpStatusCode.OK)
            }
        }
    }
}
