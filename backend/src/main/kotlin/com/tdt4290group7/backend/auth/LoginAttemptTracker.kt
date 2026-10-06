package com.tdt4290group7.backend.auth

import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Per-account brute-force protection, complementing the per-IP rate limit (which a botnet
 * spreads across many IPs). After [FREE_ATTEMPTS] consecutive failures the account is locked
 * with exponential backoff, capped at [MAX_LOCK].
 *
 * Keyed on the submitted email whether or not an account exists, so lockout behaves the same
 * for unknown emails and can't be used to enumerate accounts. In-memory: a restart clears it.
 */
object LoginAttemptTracker {
    private const val FREE_ATTEMPTS = 5
    private val BASE_LOCK: Duration = Duration.ofSeconds(30)
    private val MAX_LOCK: Duration = Duration.ofMinutes(15)
    // Failures older than this are forgotten, so occasional typos never add up to a lock.
    private val FORGET_AFTER: Duration = Duration.ofHours(1)
    // Bounds memory if someone sprays random emails; stale entries are pruned past this size.
    private const val PRUNE_THRESHOLD = 10_000

    private data class Attempts(val failures: Int, val lastFailure: Instant, val lockedUntil: Instant?)

    private val attempts = ConcurrentHashMap<String, Attempts>()

    private fun key(email: String) = email.trim().lowercase()

    /** Remaining lock time for [email], or null if a login attempt is allowed now. */
    fun lockedFor(email: String, now: Instant = Instant.now()): Duration? {
        val until = attempts[key(email)]?.lockedUntil ?: return null
        return Duration.between(now, until).takeIf { !it.isNegative && !it.isZero }
    }

    fun recordFailure(email: String, now: Instant = Instant.now()) {
        if (attempts.size > PRUNE_THRESHOLD) prune(now)
        attempts.compute(key(email)) { _, previous ->
            val failures = if (previous == null || previous.lastFailure.plus(FORGET_AFTER) < now) 1 else previous.failures + 1
            Attempts(failures, now, lockUntil(failures, now))
        }
    }

    fun recordSuccess(email: String) {
        attempts.remove(key(email))
    }

    private fun lockUntil(failures: Int, now: Instant): Instant? {
        if (failures < FREE_ATTEMPTS) return null
        // 30s, 1m, 2m, 4m, ... capped at 15m. Shift is bounded to avoid overflow.
        val lock = BASE_LOCK.multipliedBy(1L shl minOf(failures - FREE_ATTEMPTS, 20))
        return now.plus(minOf(lock, MAX_LOCK))
    }

    private fun prune(now: Instant) {
        attempts.entries.removeIf { (_, a) ->
            a.lastFailure.plus(FORGET_AFTER) < now && (a.lockedUntil == null || a.lockedUntil < now)
        }
    }
}
