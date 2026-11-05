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
                // Added after first release: nullable ADD COLUMN only, so an older release can still read the file.
                val existing = statement.executeQuery("PRAGMA table_info(users)").use { rows ->
                    buildSet { while (rows.next()) add(rows.getString("name")) }
                }
                if ("last_active_at" !in existing) statement.execute("ALTER TABLE users ADD COLUMN last_active_at TEXT")
                for ((column, type) in listOf(
                    "access_expires_at" to "TEXT", "granted_by" to "TEXT", "access_approved_by" to "TEXT",
                    "access_approved_at" to "TEXT", "is_permanent" to "INTEGER NOT NULL DEFAULT 0",
                )) {
                    if (column !in existing) statement.execute("ALTER TABLE users ADD COLUMN $column $type")
                }
                // New invitations (a supplier inviting a colleague, an admin inviting an admin, with optional stand-in end date).
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS access_invitations (
                        id TEXT PRIMARY KEY,
                        email TEXT NOT NULL COLLATE NOCASE,
                        role TEXT NOT NULL CHECK(role IN ('ADMIN', 'SUPPLIER')),
                        supplier_id TEXT,
                        supplier_name TEXT,
                        token_hash TEXT NOT NULL UNIQUE,
                        created_at TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        accepted_at TEXT,
                        invited_by TEXT NOT NULL,
                        access_expires_at TEXT
                    ) STRICT"""
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
            // The seeded administrator can never expire or be revoked, so there is always one permanent admin.
            db.prepareStatement("UPDATE users SET is_permanent = 1 WHERE email = ? AND role = 'ADMIN'").use {
                it.setString(1, "advisor.hansen@kommune.no")
                it.executeUpdate()
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
            "SELECT id, name, email, password_hash, role, supplier_id, token_version, access_expires_at, granted_by, access_approved_at, is_permanent FROM users WHERE $clause"
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
                    tokenVersion = rows.getInt("token_version"),
                    accessExpiresAt = rows.getString("access_expires_at")?.let(Instant::parse),
                    grantedBy = rows.getString("granted_by"),
                    approved = rows.getString("access_approved_at") != null,
                    permanent = rows.getInt("is_permanent") == 1,
                )
            }
        }

    fun findByEmail(email: String): User? = read { user(it, "email = ?", email.trim()) }

    fun findById(id: String): User? = read { user(it, "id = ?", id) }

    /**
     * Records that the user checked in (logged in, or had a session restored). Written at most once an hour,
     * and a failure never fails the request: activity tracking must not be able to break login.
     */
    fun recordActivity(userId: String, now: Instant = Instant.now()) {
        runCatching {
            read { db ->
                db.prepareStatement("UPDATE users SET last_active_at = ? WHERE id = ? AND (last_active_at IS NULL OR last_active_at < ?)").use {
                    it.setString(1, now.toString())
                    it.setString(2, userId)
                    it.setString(3, now.minus(ACTIVITY_WRITE_INTERVAL).toString())
                    it.executeUpdate()
                }
            }
        }.onFailure { logger.warn("activity_record_failed userId={}", userId) }
    }

    /** The most recent check-in among a supplier's accounts. */
    fun lastActiveBySupplier(): Map<String, String> = read { db ->
        db.prepareStatement(
            "SELECT supplier_id, MAX(last_active_at) AS last_active FROM users WHERE role = 'SUPPLIER' AND supplier_id IS NOT NULL AND last_active_at IS NOT NULL GROUP BY supplier_id"
        ).use { statement ->
            statement.executeQuery().use { rows -> buildMap { while (rows.next()) put(rows.getString("supplier_id"), rows.getString("last_active")) } }
        }
    }

    private val ACTIVITY_WRITE_INTERVAL: Duration = Duration.ofHours(1)

    /**
     * Whether this account may sign in or use the app right now. Access ends at the account's own end date, and
     * also when the granter's access ends, unless an admin approved the grant or the account is permanent.
     * Checked on login and on every authenticated request, so revoking or expiring access takes effect at once.
     */
    fun isAccessActive(user: User, now: Instant = Instant.now(), depth: Int = 0): Boolean {
        if (user.permanent) return true
        user.accessExpiresAt?.let { if (!now.isBefore(it)) return false }
        if (user.approved) return true
        val granter = user.grantedBy ?: return true
        if (depth >= MAX_GRANT_DEPTH) return false
        return findById(granter)?.let { isAccessActive(it, now, depth + 1) } ?: false
    }

    /** The earliest end of this account's access, following the grant chain; null when nothing along it ends. */
    fun effectiveAccessEnd(user: User, depth: Int = 0): Instant? {
        if (user.permanent) return null
        val own = user.accessExpiresAt
        if (user.approved || user.grantedBy == null || depth >= MAX_GRANT_DEPTH) return own
        val inherited = findById(user.grantedBy)?.let { effectiveAccessEnd(it, depth + 1) }
        return listOfNotNull(own, inherited).minOrNull()
    }

    private const val MAX_GRANT_DEPTH = 10

    /** Every account that belongs to this supplier: the people notified about its alerts. */
    fun supplierUserIds(supplierId: String): List<String> = read { db ->
        db.prepareStatement("SELECT id FROM users WHERE role = 'SUPPLIER' AND supplier_id = ? ORDER BY id").use { statement ->
            statement.setString(1, supplierId)
            statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.getString("id")) } }
        }
    }

    fun supplierAccountCounts(): Map<String, Int> = read { db ->
        db.prepareStatement(
            "SELECT supplier_id, COUNT(*) AS account_count FROM users WHERE role = 'SUPPLIER' AND supplier_id IS NOT NULL GROUP BY supplier_id"
        ).use { statement ->
            statement.executeQuery().use { rows ->
                buildMap {
                    while (rows.next()) {
                        put(rows.getString("supplier_id"), rows.getInt("account_count"))
                    }
                }
            }
        }
    }

    /** The user with this email and password, or null, with comparable bcrypt work either way. */
    fun authenticate(email: String, password: String): User? {
        val account = findByEmail(email)
        val matches = !PasswordPolicy.exceedsBcryptLimit(password) &&
            BCrypt.verifyer().verify(password.toCharArray(), account?.passwordHash ?: dummyPasswordHash).verified
        return account?.takeIf { matches && isAccessActive(it) }
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
            // A pending invitation from another organization must never be replaced: that would let one
            // inviter cancel or take over an address another organization has invited.
            val pendingElsewhere = db.prepareStatement(
                "SELECT supplier_id, expires_at FROM supplier_invitations WHERE email = ? AND accepted_at IS NULL AND supplier_id != ?"
            ).use { statement ->
                statement.setString(1, normalizedEmail)
                statement.setString(2, supplierId)
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(Instant.parse(rows.getString("expires_at"))) }
                }
            }.any { it.isAfter(now) }
            if (pendingElsewhere || pendingAccessInvitationElsewhere(db, normalizedEmail, "SUPPLIER", supplierId, now)) {
                throw AccountConflictException("This email has a pending invitation from another organization")
            }
            db.prepareStatement("DELETE FROM supplier_invitations WHERE email = ? AND supplier_id = ? AND accepted_at IS NULL").use {
                it.setString(1, normalizedEmail)
                it.setString(2, supplierId)
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

    // ---- Shared access: colleagues, stand-ins and admin invitations ----

    data class AccessInvitation(val token: String, val expiresAt: String, val accessExpiresAt: String?)

    private fun pendingAccessInvitationElsewhere(db: Connection, email: String, role: String, supplierId: String?, now: Instant): Boolean =
        db.prepareStatement(
            "SELECT role, supplier_id, expires_at FROM access_invitations WHERE email = ? AND accepted_at IS NULL"
        ).use { statement ->
            statement.setString(1, email)
            statement.executeQuery().use { rows ->
                buildList { while (rows.next()) add(Triple(rows.getString("role"), rows.getString("supplier_id"), Instant.parse(rows.getString("expires_at")))) }
            }
        }.any { (r, s, expires) -> expires.isAfter(now) && (r != role || s != supplierId) }

    private fun pendingSupplierInvitationElsewhere(db: Connection, email: String, supplierId: String?, now: Instant): Boolean =
        db.prepareStatement("SELECT supplier_id, expires_at FROM supplier_invitations WHERE email = ? AND accepted_at IS NULL").use { statement ->
            statement.setString(1, email)
            statement.executeQuery().use { rows ->
                buildList { while (rows.next()) add(rows.getString("supplier_id") to Instant.parse(rows.getString("expires_at"))) }
            }
        }.any { (s, expires) -> expires.isAfter(now) && s != supplierId }

    /**
     * Invites a colleague (supplier) or another admin. [inviter] supplies the organization and caps the grant:
     * it cannot outlive the inviter's own access. A null [accessEnd] means access with no end date, which only
     * an inviter whose own access has no end can give.
     */
    fun createAccessInvitation(inviter: User, email: String, supplierName: String?, accessEnd: java.time.LocalDate?, now: Instant = Instant.now()): AccessInvitation {
        val normalizedEmail = email.trim().lowercase()
        require(normalizedEmail.length <= 254 && normalizedEmail.matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) { "Enter a valid email address" }
        val accessExpires = grantExpiry(inviter, accessEnd, now)
        val token = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
        val expiresAt = now.plus(INVITATION_TTL)
        val role = inviter.role.name
        write { db ->
            if (user(db, "email = ?", normalizedEmail) != null) throw AccountConflictException("An account already exists for this email address")
            if (pendingAccessInvitationElsewhere(db, normalizedEmail, role, inviter.supplierId, now) ||
                pendingSupplierInvitationElsewhere(db, normalizedEmail, inviter.supplierId.takeIf { inviter.role == Role.SUPPLIER }, now) ||
                (inviter.role == Role.ADMIN && pendingSupplierInvitationElsewhere(db, normalizedEmail, "\u0000none", now))
            ) throw AccountConflictException("This email has a pending invitation from another organization")
            db.prepareStatement("DELETE FROM access_invitations WHERE email = ? AND accepted_at IS NULL").use { it.setString(1, normalizedEmail); it.executeUpdate() }
            db.prepareStatement(
                """INSERT INTO access_invitations (id, email, role, supplier_id, supplier_name, token_hash, created_at, expires_at, accepted_at, invited_by, access_expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)"""
            ).use {
                it.setString(1, UUID.randomUUID().toString()); it.setString(2, normalizedEmail); it.setString(3, role)
                it.setString(4, inviter.supplierId); it.setString(5, supplierName); it.setString(6, sha256(token))
                it.setString(7, now.toString()); it.setString(8, expiresAt.toString()); it.setString(9, inviter.id)
                it.setString(10, accessExpires?.toString())
                it.executeUpdate()
            }
        }
        return AccessInvitation(token, expiresAt.toString(), accessExpires?.toString())
    }

    /** Access ends at midnight Oslo after the end date. */
    fun accessExpiryFor(endDate: java.time.LocalDate): Instant =
        endDate.plusDays(1).atStartOfDay(java.time.ZoneId.of("Europe/Oslo")).toInstant()

    /** Validates a requested end date against the 90-day maximum and the granter's own access; null means no end. */
    fun grantExpiry(granter: User, endDate: java.time.LocalDate?, now: Instant): Instant? {
        val granterEnd = effectiveAccessEnd(granter)
        if (endDate == null) {
            return granterEnd // inherits the granter's end; null when the granter's access has none
        }
        val today = now.atZone(java.time.ZoneId.of("Europe/Oslo")).toLocalDate()
        require(endDate.isAfter(today) || endDate == today) { "The end date cannot be in the past" }
        require(!endDate.isAfter(today.plusDays(MAX_GRANT_DAYS))) { "Access can be given for at most $MAX_GRANT_DAYS days at a time" }
        val expiry = accessExpiryFor(endDate)
        require(granterEnd == null || !expiry.isAfter(granterEnd)) { "The end date cannot be later than the end of your own access" }
        return expiry
    }

    const val MAX_GRANT_DAYS = 90L
    private const val RENEW_WINDOW_DAYS = 14L

    data class AccessEntry(
        val id: String, val name: String, val email: String, val role: Role, val supplierId: String?,
        val grantedByName: String?, val accessExpiresAt: Instant?, val approved: Boolean, val permanent: Boolean, val active: Boolean,
    )

    private fun entry(db: Connection, u: User, now: Instant) = AccessEntry(
        u.id, u.name, u.email, u.role, u.supplierId,
        u.grantedBy?.let { user(db, "id = ?", it)?.name }, u.accessExpiresAt, u.approved, u.permanent, isAccessActive(u, now),
    )

    /** Everyone with access, newest first: all accounts for an admin, one organization for a supplier. */
    fun accessList(supplierId: String?, now: Instant = Instant.now()): List<AccessEntry> = read { db ->
        val sql = "SELECT id FROM users" + (if (supplierId != null) " WHERE supplier_id = ?" else "") + " ORDER BY role, email"
        db.prepareStatement(sql).use { statement ->
            if (supplierId != null) statement.setString(1, supplierId)
            statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.getString("id")) } }
        }.mapNotNull { user(db, "id = ?", it)?.let { u -> entry(db, u, now) } }
    }

    private fun mayManage(actor: User, target: User): Boolean =
        actor.role == Role.ADMIN || (actor.role == Role.SUPPLIER && actor.supplierId != null && actor.supplierId == target.supplierId && target.grantedBy == actor.id)

    /** Renew a grant that is close to expiring (14 days or fewer left) or has expired. Never your own. */
    fun renewAccess(actor: User, targetId: String, endDate: java.time.LocalDate, now: Instant = Instant.now()) {
        val target = findById(targetId) ?: throw NoSuchElementException("Account not found")
        require(actor.id != target.id) { "You cannot renew your own access" }
        require(mayManage(actor, target)) { "Only the person who gave this access, or an administrator, can renew it" }
        val end = target.accessExpiresAt ?: throw IllegalArgumentException("This access has no end date to renew")
        require(!target.permanent) { "This account cannot expire" }
        require(end.isBefore(now.plus(Duration.ofDays(RENEW_WINDOW_DAYS)))) { "Access can be renewed when it has $RENEW_WINDOW_DAYS days or fewer left" }
        val expiry = if (actor.role == Role.ADMIN) {
            val today = now.atZone(java.time.ZoneId.of("Europe/Oslo")).toLocalDate()
            require(!endDate.isBefore(today) && !endDate.isAfter(today.plusDays(MAX_GRANT_DAYS))) { "Access can be given for at most $MAX_GRANT_DAYS days at a time" }
            accessExpiryFor(endDate)
        } else grantExpiry(actor, endDate, now)!!
        write { db ->
            db.prepareStatement("UPDATE users SET access_expires_at = ? WHERE id = ?").use { it.setString(1, expiry.toString()); it.setString(2, targetId); it.executeUpdate() }
        }
    }

    /** Ends someone's access now. The granter or an admin can; the permanent admin never. */
    fun revokeAccess(actor: User, targetId: String, now: Instant = Instant.now()) {
        val target = findById(targetId) ?: throw NoSuchElementException("Account not found")
        require(!target.permanent) { "This account cannot be removed" }
        require(actor.id != target.id) { "You cannot remove your own access" }
        require(mayManage(actor, target)) { "Only the person who gave this access, or an administrator, can remove it" }
        write { db ->
            db.prepareStatement("UPDATE users SET access_expires_at = ? WHERE id = ?").use { it.setString(1, now.toString()); it.setString(2, targetId); it.executeUpdate() }
        }
    }

    /** An admin approves a grant so it keeps working if the person who gave it later loses access. */
    fun approveAccess(admin: User, targetId: String, now: Instant = Instant.now()) {
        require(admin.role == Role.ADMIN) { "Administrator access required" }
        val target = findById(targetId) ?: throw NoSuchElementException("Account not found")
        require(target.grantedBy != null) { "Only access that someone granted needs approval" }
        write { db ->
            db.prepareStatement("UPDATE users SET access_approved_by = ?, access_approved_at = ? WHERE id = ?").use {
                it.setString(1, admin.id); it.setString(2, now.toString()); it.setString(3, targetId); it.executeUpdate()
            }
        }
    }

    /** Returns null for unknown, expired, or already-consumed invitation tokens. */
    fun acceptSupplierInvitation(
        token: String,
        password: String,
        now: Instant = Instant.now(),
        supplierIsActive: (String) -> Boolean = { true },
        name: String? = null
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
            } ?: return@write acceptAccessInvitation(db, tokenHash, password, name, now, supplierIsActive)
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

    /** Accepts a colleague or admin invitation. The person gives their own name, so accounts can be told apart. */
    private fun acceptAccessInvitation(db: Connection, tokenHash: String, password: String, name: String?, now: Instant, supplierIsActive: (String) -> Boolean): User? {
        data class Row(val id: String, val email: String, val role: String, val supplierId: String?, val invitedBy: String, val expiresAt: Instant, val accessExpiresAt: Instant?)
        val invite = db.prepareStatement(
            "SELECT id, email, role, supplier_id, invited_by, expires_at, access_expires_at FROM access_invitations WHERE token_hash = ? AND accepted_at IS NULL"
        ).use { statement ->
            statement.setString(1, tokenHash)
            statement.executeQuery().use { rows ->
                if (!rows.next()) null else Row(
                    rows.getString("id"), rows.getString("email"), rows.getString("role"), rows.getString("supplier_id"), rows.getString("invited_by"),
                    Instant.parse(rows.getString("expires_at")), rows.getString("access_expires_at")?.let(Instant::parse),
                )
            }
        } ?: return null
        val displayName = name?.trim().orEmpty()
        if (displayName.isEmpty() || displayName.length > 100) throw IllegalArgumentException("Enter your name")
        if (!invite.expiresAt.isAfter(now) || user(db, "email = ?", invite.email) != null) return null
        if (invite.role == "SUPPLIER" && !supplierIsActive(invite.supplierId.orEmpty())) return null
        // The invitation cannot create access that outlasts its end date, or the inviter's own access.
        if (invite.accessExpiresAt != null && !now.isBefore(invite.accessExpiresAt)) return null
        val inviter = user(db, "id = ?", invite.invitedBy)
        if (inviter == null || !isAccessActive(inviter, now)) return null

        val userId = UUID.randomUUID().toString()
        db.prepareStatement(
            """INSERT INTO users (id, name, email, password_hash, role, supplier_id, token_version, access_expires_at, granted_by)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)"""
        ).use {
            it.setString(1, userId); it.setString(2, displayName); it.setString(3, invite.email); it.setString(4, hash(password))
            it.setString(5, invite.role); it.setString(6, invite.supplierId); it.setString(7, invite.accessExpiresAt?.toString()); it.setString(8, invite.invitedBy)
            it.executeUpdate()
        }
        db.prepareStatement("UPDATE access_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").use {
            it.setString(1, now.toString()); it.setString(2, invite.id)
            check(it.executeUpdate() == 1) { "Invitation was already accepted" }
        }
        return user(db, "id = ?", userId)
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
