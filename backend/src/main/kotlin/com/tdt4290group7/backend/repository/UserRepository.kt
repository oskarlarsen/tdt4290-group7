package com.tdt4290group7.backend.repository

import at.favre.lib.crypto.bcrypt.BCrypt
import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.model.User
import java.util.UUID
import org.slf4j.LoggerFactory

/**
 * In-memory, seeded user store. There is no database yet, so accounts are fixed at startup.
 * Seed passwords are read from env vars so real credentials never live in source control;
 * insecure defaults are used only for local development, and that fact is logged loudly.
 */
object UserRepository {
    private val logger = LoggerFactory.getLogger(UserRepository::class.java)

    private val usersById: Map<String, User>
    private val usersByEmail: Map<String, User>

    init {
        val adminPassword = envOrInsecureDefault("SEED_ADMIN_PASSWORD", "admin-dev-only")
        val supplierPassword = envOrInsecureDefault("SEED_SUPPLIER_PASSWORD", "supplier-dev-only")

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

        usersById = seeded.associateBy { it.id }
        usersByEmail = seeded.associateBy { it.email.lowercase() }
    }

    private fun envOrInsecureDefault(envVar: String, default: String): String {
        val value = System.getenv(envVar)
        if (value.isNullOrBlank()) {
            logger.warn("$envVar is not set. Using an insecure development-only password. Set $envVar in production.")
            return default
        }
        return value
    }

    private fun hash(password: String): String = BCrypt.withDefaults().hashToString(12, password.toCharArray())

    fun findByEmail(email: String): User? = usersByEmail[email.trim().lowercase()]

    fun findById(id: String): User? = usersById[id]

    fun verifyPassword(user: User, password: String): Boolean =
        BCrypt.verifyer().verify(password.toCharArray(), user.passwordHash).verified
}
