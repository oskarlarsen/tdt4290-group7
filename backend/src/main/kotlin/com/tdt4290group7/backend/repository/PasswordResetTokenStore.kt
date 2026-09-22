package com.tdt4290group7.backend.repository

import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap

/**
 * In-memory, single-use password reset tokens with a fixed TTL.
 * Tokens are stored keyed by their SHA-256 hash, so a memory dump does not
 * expose usable reset tokens. No database yet — a restart clears pending resets.
 */
object PasswordResetTokenStore {
    private const val TTL_MINUTES = 15L

    private val random = SecureRandom()

    // key = SHA-256(token), value = (userId, expiresAt)
    private val tokens = ConcurrentHashMap<String, Pair<String, Instant>>()

    fun create(userId: String): String {
        val bytes = ByteArray(32).also(random::nextBytes)
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        tokens[sha256(token)] = userId to Instant.now().plusSeconds(TTL_MINUTES * 60)
        return token
    }

    /** Single-use: returns the userId if the token is valid, null otherwise. Always consumes the token. */
    fun consume(token: String): String? =
        tokens.remove(sha256(token))?.takeIf { it.second.isAfter(Instant.now()) }?.first

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
