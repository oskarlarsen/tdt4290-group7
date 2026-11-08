package com.tdt4290group7.backend.plugins

import com.auth0.jwt.JWT
import com.tdt4290group7.backend.auth.AuthCookie
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.http.auth.HttpAuthHeader
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.auth.Authentication
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.jwt.jwt

const val AUTH_JWT = "auth-jwt"

fun Application.configureSecurity() {
    install(Authentication) {
        jwt(AUTH_JWT) {
            realm = JwtConfig.REALM
            // The token comes only from the HttpOnly cookie; Authorization headers are ignored.
            authHeader { call ->
                call.request.cookies[AuthCookie.NAME]
                    ?.takeIf { it.isNotBlank() }
                    ?.let { HttpAuthHeader.Single("Bearer", it) }
            }
            verifier(
                JWT.require(JwtConfig.algorithm)
                    .withIssuer(JwtConfig.issuer)
                    .withAudience(JwtConfig.audience)
                    .build()
            )
            validate { credential ->
                val userId = JwtConfig.userId(credential.payload)
                val user = userId?.let { UserRepository.findById(it) }
                // Reject tokens issued before the user's last password change.
                // Also rejects accounts whose (stand-in) access has ended or been revoked, on every request.
                val current = user != null && JwtConfig.tokenVersion(credential.payload) == user.tokenVersion &&
                    UserRepository.isAccessActive(user)
                if (current) JWTPrincipal(credential.payload) else null
            }
        }
    }
}
