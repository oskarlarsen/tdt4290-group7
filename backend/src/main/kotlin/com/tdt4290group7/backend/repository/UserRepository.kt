package com.tdt4290group7.backend.repository

import at.favre.lib.crypto.bcrypt.BCrypt
import com.tdt4290group7.backend.auth.PasswordPolicy
import com.tdt4290group7.backend.backendSetting
import com.tdt4290group7.backend.config.requireSecret
import com.tdt4290group7.backend.model.Role
import com.tdt4290group7.backend.model.User
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Connection
import java.sql.DriverManager
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import org.slf4j.LoggerFactory

data class SupplierInvitation(val token: String, val expiresAt: String)

class AccountConflictException(message: String) : RuntimeException(message)

/**
 * SQLite-backed account store. Supplier accounts are created only after a one-time invitation
 * has been accepted; the bootstrap administrator remains seeded from environment configuration.
 */
object UserRepository {
    private val logger = LoggerFactory.getLogger(UserRepository::class.java)
    private val databaseUrl: String
    private val random = SecureRandom()
    private val dummyPasswordHash = hash(UUID.randomUUID().toString())

    init {
        val path = Path.of(backendSetting("USER_DB_PATH") ?: "data/users.db").toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = "jdbc:sqlite:$path"
        write { db ->
            db.createStatement().use { statement ->
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                        password_hash TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('ADMIN', 'SUPPLIER')),
                        supplier_id TEXT,
                        token_version INTEGER NOT NULL DEFAULT 0
                    ) STRICT"""
                )
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS supplier_invitations (
                        id TEXT PRIMARY KEY,
                        email TEXT NOT NULL COLLATE NOCASE,
                        supplier_id TEXT NOT NULL,
                        supplier_name TEXT NOT NULL,
                        token_hash TEXT NOT NULL UNIQUE,
                        created_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        accepted_at TEXT
                    ) STRICT"""
                )
                statement.execute(
                    "CREATE INDEX IF NOT EXISTS idx_supplier_invitations_email ON supplier_invitations(email, accepted_at)"
                )
            }
            val adminPassword = hash(requireSeedPassword("SEED_ADMIN_PASSWORD"))
            db.prepareStatement(
                "INSERT OR IGNORE INTO users (id, name, email, password_hash, role, supplier_id, token_version) VALUES (?, ?, ?, ?, 'ADMIN', NULL, 0)"
            ).use { statement ->
                statement.setString(1, UUID.randomUUID().toString())
                statement.setString(2, "Advisor Hansen")
                statement.setString(3, "advisor.hansen@kommune.no")
                statement.setString(4, adminPassword)
                statement.executeUpdate()
            }
        }
    }

    val count: Int get() = read { db ->
        db.createStatement().use { statement ->
            statement.executeQuery("SELECT COUNT(*) FROM users").use { rows -> rows.next(); rows.getInt(1) }
        }
    }

    private fun requireSeedPassword(envVar: String): String =
        runCatching { requireSecret(envVar, backendSetting(envVar)) }
            .onFailure { logger.error(it.message) }
            .getOrThrow()

    private fun connection(): Connection = DriverManager.getConnection(databaseUrl).also { db ->
        db.createStatement().use {
            it.execute("PRAGMA busy_timeout = 5000")
            it.execute("PRAGMA foreign_keys = ON")
        }
    }

    private fun <T> read(action: (Connection) -> T): T = connection().use { db -> action(db) }

    private fun <T> write(action: (Connection) -> T): T = connection().use { db ->
        db.autoCommit = false
        try {
            val result = action(db)
            db.commit()
            result
        } catch (cause: Exception) {
            db.rollback()
            throw cause
        }
    }

    private fun hash(password: String): String = BCrypt.withDefaults().hashToString(12, password.toCharArray())

    private fun user(db: Connection, clause: String, value: String): User? =
        db.prepareStatement(
            "SELECT id, name, email, password_hash, role, supplier_id, token_version FROM users WHERE $clause"
        ).use { statement ->
            statement.setString(1, value)
            statement.executeQuery().use { rows ->
                if (!rows.next()) null else User(
                    id = rows.getString("id"),
                    name = rows.getString("name"),
                    email = rows.getString("email"),
                    passwordHash = rows.getString("password_hash"),
                    role = Role.valueOf(rows.getString("role")),
                    supplierId = rows.getString("supplier_id"),
                    tokenVersion = rows.getInt("token_version")
                )
            }
        }

    fun findByEmail(email: String): User? = read { user(it, "email = ?", email.trim()) }

    fun findById(id: String): User? = read { user(it, "id = ?", id) }

    /** The user with this email and password, or null, with comparable bcrypt work either way. */
    fun authenticate(email: String, password: String): User? {
        val account = findByEmail(email)
        val matches = !PasswordPolicy.exceedsBcryptLimit(password) &&
            BCrypt.verifyer().verify(password.toCharArray(), account?.passwordHash ?: dummyPasswordHash).verified
        return account?.takeIf { matches }
    }

    fun createSupplierInvitation(
        supplierId: String,
        supplierName: String,
        email: String,
        now: Instant = Instant.now()
    ): SupplierInvitation {
        require(supplierId.isNotBlank()) { "Supplier organization is required" }
        val normalizedEmail = email.trim().lowercase()
        require(normalizedEmail.length <= 254 && normalizedEmail.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) {
            "Enter a valid email address"
        }
        val tokenBytes = ByteArray(32).also(random::nextBytes)
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes)
        val expiresAt = now.plus(INVITATION_TTL)

        write { db ->
            if (user(db, "email = ?", normalizedEmail) != null) {
                throw AccountConflictException("An account already exists for this email address")
            }
            db.prepareStatement("DELETE FROM supplier_invitations WHERE email = ? AND accepted_at IS NULL").use {
                it.setString(1, normalizedEmail)
                it.executeUpdate()
            }
            db.prepareStatement(
                """INSERT INTO supplier_invitations
                   (id, email, supplier_id, supplier_name, token_hash, created_at, expires_at, accepted_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"""
            ).use {
                it.setString(1, UUID.randomUUID().toString())
                it.setString(2, normalizedEmail)
                it.setString(3, supplierId)
                it.setString(4, supplierName)
                it.setString(5, sha256(token))
                it.setString(6, now.toString())
                it.setString(7, expiresAt.toString())
                it.executeUpdate()
            }
        }
        return SupplierInvitation(token, expiresAt.toString())
    }

    /** Returns null for unknown, expired, or already-consumed invitation tokens. */
    fun acceptSupplierInvitation(
        token: String,
        password: String,
        now: Instant = Instant.now(),
        supplierIsActive: (String) -> Boolean = { true }
    ): User? {
        if (token.length !in 32..128) return null
        val tokenHash = sha256(token)
        return write { db ->
            val invite = db.prepareStatement(
                """SELECT id, email, supplier_id, supplier_name, expires_at
                   FROM supplier_invitations
                   WHERE token_hash = ? AND accepted_at IS NULL"""
            ).use { statement ->
                statement.setString(1, tokenHash)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) null else InvitationRow(
                        id = rows.getString("id"),
                        email = rows.getString("email"),
                        supplierId = rows.getString("supplier_id"),
                        supplierName = rows.getString("supplier_name"),
                        expiresAt = Instant.parse(rows.getString("expires_at"))
                    )
                }
            } ?: return@write null
            if (!invite.expiresAt.isAfter(now) || !supplierIsActive(invite.supplierId) || user(db, "email = ?", invite.email) != null) return@write null

            val userId = UUID.randomUUID().toString()
            db.prepareStatement(
                """INSERT INTO users (id, name, email, password_hash, role, supplier_id, token_version)
                   VALUES (?, ?, ?, ?, 'SUPPLIER', ?, 0)"""
            ).use {
                it.setString(1, userId)
                it.setString(2, invite.supplierName)
                it.setString(3, invite.email)
                it.setString(4, hash(password))
                it.setString(5, invite.supplierId)
                it.executeUpdate()
            }
            db.prepareStatement("UPDATE supplier_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").use {
                it.setString(1, now.toString())
                it.setString(2, invite.id)
                check(it.executeUpdate() == 1) { "Invitation was already accepted" }
            }
            user(db, "id = ?", userId)
        }
    }

    /** Sets a new password and bumps tokenVersion, invalidating every existing JWT. */
    fun updatePassword(user: User, newPassword: String) {
        write { db ->
            db.prepareStatement("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").use {
                it.setString(1, hash(newPassword))
                it.setString(2, user.id)
                check(it.executeUpdate() == 1) { "Account no longer exists" }
            }
        }
    }

    private fun sha256(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    private data class InvitationRow(
        val id: String,
        val email: String,
        val supplierId: String,
        val supplierName: String,
        val expiresAt: Instant
    )

    private const val INVITATION_TTL_HOURS = 48L
    private val INVITATION_TTL = Duration.ofHours(INVITATION_TTL_HOURS)
}
