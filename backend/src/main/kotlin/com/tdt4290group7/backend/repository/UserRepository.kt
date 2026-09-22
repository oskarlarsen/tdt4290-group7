package com.tdt4290group7.backend.repository

import at.favre.lib.crypto.bcrypt.BCrypt
import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.model.User
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import org.slf4j.LoggerFactory

/**
 * In-memory, seeded user store. There is no database yet, so accounts are fixed at startup.
 * Seed passwords are read from env vars so real credentials never live in source control;
 * startup fails if any of them is missing.
 */
object UserRepository {
    private val logger = LoggerFactory.getLogger(UserRepository::class.java)

    private val usersById = ConcurrentHashMap<String, User>()
    private val usersByEmail = ConcurrentHashMap<String, User>()

    val count: Int get() = usersById.size

    init {
        val adminPassword = requireSeedPassword("SEED_ADMIN_PASSWORD")
        val supplierPassword = requireSeedPassword("SEED_SUPPLIER_PASSWORD")

        val seeded = listOf(
            User(
                id = UUID.randomUUID().toString(),
                name = "Advisor Hansen",
                email = "advisor.hansen@kommune.no",
                passwordHash = hash(adminPassword),
                role = Role.ADMIN,
            ),
            User(
                id = UUID.randomUUID().toString(),
                name = "Nordvik Transport AS",
                email = "supplier@nordvik.no",
                passwordHash = hash(supplierPassword),
                role = Role.SUPPLIER,
                supplierId = "nordvik-transport",
            ),
        )

        seeded.forEach {
            usersById[it.id] = it
            usersByEmail[it.email.lowercase()] = it
        }
    }

    private fun requireSeedPassword(envVar: String): String {
        val value = System.getenv(envVar)
        if (value.isNullOrBlank()) {
            val message = "$envVar is not set. Refusing to start: seed accounts would have " +
                    "credentials published in source control. Set $envVar and restart."
            logger.error(message)
            throw IllegalStateException(message)
        }
        return value
    }

    private fun hash(password: String): String = BCrypt.withDefaults().hashToString(12, password.toCharArray())

    fun findByEmail(email: String): User? = usersByEmail[email.trim().lowercase()]

    fun findById(id: String): User? = usersById[id]

    fun verifyPassword(user: User, password: String): Boolean =
        BCrypt.verifyer().verify(password.toCharArray(), user.passwordHash).verified

    fun updatePassword(user: User, newPassword: String) {
        val updated = user.copy(passwordHash = hash(newPassword))
        usersById[updated.id] = updated
        usersByEmail[updated.email.lowercase()] = updated
    }
}
