package com.tdt4290group7.backend.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.Payload
import com.tdt4290group7.backend.config.requireSecret
import com.tdt4290group7.backend.model.User
import java.util.Date

object JwtConfig {
    val issuer: String = System.getenv("JWT_ISSUER") ?: "tdt4290-backend"
    val audience: String = System.getenv("JWT_AUDIENCE") ?: "tdt4290-frontend"
    const val REALM = "tdt4290-api"
    const val CLAIM_USER_ID = "uid"
    const val CLAIM_TOKEN_VERSION = "tv"

    private val secret: String = requireSecret("JWT_SECRET", System.getenv("JWT_SECRET"))

    val algorithm: Algorithm = Algorithm.HMAC256(secret)

    private val shortLivedMillis = 24L * 60 * 60 * 1000 // 1 day
    val longLivedMillis = 30L * 24 * 60 * 60 * 1000 // 30 days

    fun generateToken(user: User, rememberMe: Boolean): Pair<String, Date> {
        val expiresAt = Date(System.currentTimeMillis() + if (rememberMe) longLivedMillis else shortLivedMillis)
        val token = JWT.create()
            .withIssuer(issuer)
            .withAudience(audience)
            .withClaim(CLAIM_USER_ID, user.id)
            .withClaim(CLAIM_TOKEN_VERSION, user.tokenVersion)
            .withExpiresAt(expiresAt)
            .sign(algorithm)
        return token to expiresAt
    }

    fun userId(payload: Payload): String? = payload.getClaim(CLAIM_USER_ID).asString()

    fun tokenVersion(payload: Payload): Int? = payload.getClaim(CLAIM_TOKEN_VERSION).asInt()
}
