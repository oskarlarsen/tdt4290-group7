package com.tdt4290group7.backend.admin

import com.tdt4290group7.backend.jdbcUrl
import com.tdt4290group7.backend.link
import java.nio.file.Files
import java.nio.file.Path
import java.sql.DriverManager
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

data class AdminAlertRecord(
    val id: String,
    val title: String,
    val description: String,
    val severity: String,
    val status: String,
    val supplierId: String?,
    val category: String,
    val findingType: String,
    val source: String,
    val dueDate: String?,
    val affectedItemType: String?,
    val affectedItemName: String?,
    val reason: String?,
    val createdAt: String,
    val findingKey: String?,
    val archivedAt: String? = null,
)

data class SupplierNoteRecord(
    val id: String,
    val supplierId: String,
    val authorId: String,
    val authorName: String,
    val visibility: String,
    val text: String,
    val alertId: String?,
    val createdAt: String,
)

data class NotificationRecord(
    val id: String,
    val alertId: String,
    val type: String,
    val title: String,
    val message: String,
    val severity: String,
    val createdAt: String,
    val read: Boolean,
)

class AdminInsightsRepository(databasePath: Path) {
    private val databaseUrl: String

    init {
        val path = databasePath.toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = jdbcUrl(path)
        DriverManager.getConnection(databaseUrl).use { database ->
            database.createStatement().use { statement ->
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS admin_alerts (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        status TEXT NOT NULL,
                        supplier_id TEXT${database.link("suppliers")},
                        category TEXT NOT NULL,
                        finding_type TEXT NOT NULL,
                        source TEXT NOT NULL,
                        due_date TEXT,
                        affected_item_type TEXT,
                        affected_item_name TEXT,
                        reason TEXT,
                        created_at TEXT NOT NULL,
                        finding_key TEXT UNIQUE,
                        deleted INTEGER NOT NULL DEFAULT 0
                    )""".trimIndent(),
                )
                // Added after first release: nullable ADD COLUMN only, so an older release can still read the file.
                val existing = statement.executeQuery("PRAGMA table_info(admin_alerts)").use { rows ->
                    buildSet { while (rows.next()) add(rows.getString("name")) }
                }
                // visible_to_supplier is 0 for every alert that existed before suppliers could see alerts, so old manual
                // alerts, written for admins, stay hidden until someone decides otherwise.
                for ((column, type) in listOf("archived_at" to "TEXT", "archived_by" to "TEXT", "resolved_by_system" to "INTEGER NOT NULL DEFAULT 0", "visible_to_supplier" to "INTEGER NOT NULL DEFAULT 0")) {
                    if (column !in existing) statement.execute("ALTER TABLE admin_alerts ADD COLUMN $column $type")
                }
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS notifications (
                        id TEXT PRIMARY KEY,
                        recipient_user_id TEXT NOT NULL${database.link("users")},
                        alert_id TEXT NOT NULL${database.link("admin_alerts")},
                        type TEXT NOT NULL,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        read_at TEXT,
                        UNIQUE(recipient_user_id, alert_id)
                    )""".trimIndent(),
                )
                statement.execute("CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, read_at)")
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS admin_insights_metadata (
                        name TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )""".trimIndent(),
                )
                // Admin-only notes. SELF notes are returned to their author only, INTERNAL notes to every admin.
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS supplier_notes (
                        id TEXT PRIMARY KEY,
                        supplier_id TEXT NOT NULL${database.link("suppliers")},
                        author_id TEXT NOT NULL${database.link("users")},
                        author_name TEXT NOT NULL,
                        visibility TEXT NOT NULL CHECK(visibility IN ('SELF','INTERNAL')),
                        text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),
                        alert_id TEXT${database.link("admin_alerts")},
                        created_at TEXT NOT NULL
                    )""".trimIndent(),
                )
                statement.execute("CREATE INDEX IF NOT EXISTS idx_supplier_notes_supplier ON supplier_notes(supplier_id, created_at)")
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS supplier_review_statuses (
                        supplier_id TEXT PRIMARY KEY${database.link("suppliers")},
                        status TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        updated_by TEXT NOT NULL${database.link("users")}
                    )""".trimIndent(),
                )
            }
        }
    }

    /** Returns true when the alert did not exist before, so the caller can notify the supplier. */
    fun upsertFinding(record: AdminAlertRecord): Boolean {
        return DriverManager.getConnection(databaseUrl).use { database ->
            val existed = database.prepareStatement("SELECT 1 FROM admin_alerts WHERE id = ?").use { statement ->
                statement.setString(1, record.id)
                statement.executeQuery().use { it.next() }
            }
            database.prepareStatement(
                """INSERT INTO admin_alerts
                    (id, title, description, severity, status, supplier_id, category, finding_type, source,
                     due_date, affected_item_type, affected_item_name, reason, created_at, finding_key, visible_to_supplier)
                    VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, 'AUTOMATIC', ?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(id) DO UPDATE SET
                      title = excluded.title,
                      description = excluded.description,
                      severity = excluded.severity,
                      supplier_id = excluded.supplier_id,
                      category = excluded.category,
                      finding_type = excluded.finding_type,
                      due_date = excluded.due_date,
                      affected_item_type = excluded.affected_item_type,
                      affected_item_name = excluded.affected_item_name,
                      reason = excluded.reason,
                      visible_to_supplier = 1,
                      -- An alert the system resolved (its evidence went away, e.g. a certificate was archived)
                      -- reopens when the same evidence returns. One an admin resolved stays resolved.
                      status = CASE WHEN admin_alerts.resolved_by_system = 1 THEN 'OPEN' ELSE admin_alerts.status END,
                      resolved_by_system = 0
                    WHERE admin_alerts.deleted = 0""".trimIndent(),
            ).use { statement ->
                statement.setString(1, record.id)
                statement.setString(2, record.title)
                statement.setString(3, record.description)
                statement.setString(4, record.severity)
                statement.setString(5, record.supplierId)
                statement.setString(6, record.category)
                statement.setString(7, record.findingType)
                statement.setString(8, record.dueDate)
                statement.setString(9, record.affectedItemType)
                statement.setString(10, record.affectedItemName)
                statement.setString(11, record.reason)
                statement.setString(12, record.createdAt)
                statement.setString(13, record.findingKey)
                statement.executeUpdate()
            }
            !existed
        }
    }

    fun resolveInactiveFindings(activeFindingKeys: Set<String>) {
        DriverManager.getConnection(databaseUrl).use { database ->
            val existingKeys = database.prepareStatement(
                "SELECT finding_key FROM admin_alerts WHERE source = 'AUTOMATIC' AND deleted = 0 AND status != 'RESOLVED'",
            ).use { statement ->
                statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.getString(1)) } }
            }
            database.prepareStatement(
                "UPDATE admin_alerts SET status = 'RESOLVED', resolved_by_system = 1 WHERE finding_key = ? AND status != 'RESOLVED'",
            ).use { statement ->
                existingKeys.filterNot(activeFindingKeys::contains).forEach { key ->
                    statement.setString(1, key)
                    statement.addBatch()
                }
                statement.executeBatch()
            }
        }
    }

    fun createManual(
        title: String,
        description: String,
        severity: String,
        supplierId: String,
        category: String,
        findingType: String,
        dueDate: String?,
        now: Instant,
    ): AdminAlertRecord {
        val record = AdminAlertRecord(
            id = UUID.randomUUID().toString(),
            title = title,
            description = description,
            severity = severity,
            status = "OPEN",
            supplierId = supplierId,
            category = category,
            findingType = findingType,
            source = "MANUAL",
            dueDate = dueDate,
            affectedItemType = null,
            affectedItemName = null,
            reason = null,
            createdAt = now.toString(),
            findingKey = null,
        )
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """INSERT INTO admin_alerts
                    (id, title, description, severity, status, supplier_id, category, finding_type, source,
                     due_date, affected_item_type, affected_item_name, reason, created_at, finding_key, visible_to_supplier)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""".trimIndent(),
            ).use { statement ->
                statement.setString(1, record.id)
                statement.setString(2, record.title)
                statement.setString(3, record.description)
                statement.setString(4, record.severity)
                statement.setString(5, record.status)
                statement.setString(6, record.supplierId)
                statement.setString(7, record.category)
                statement.setString(8, record.findingType)
                statement.setString(9, record.source)
                statement.setString(10, record.dueDate)
                statement.setString(11, record.affectedItemType)
                statement.setString(12, record.affectedItemName)
                statement.setString(13, record.reason)
                statement.setString(14, record.createdAt)
                statement.setString(15, record.findingKey)
                statement.executeUpdate()
            }
        }
        return record
    }

    fun allAlerts(): List<AdminAlertRecord> =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT * FROM admin_alerts WHERE deleted = 0 ORDER BY created_at DESC").use { statement ->
                statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.toAlert()) } }
            }
        }

    fun updateStatus(id: String, status: String): AdminAlertRecord? =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("UPDATE admin_alerts SET status = ?, resolved_by_system = 0 WHERE id = ? AND deleted = 0").use {
                it.setString(1, status)
                it.setString(2, id)
                if (it.executeUpdate() != 1) return null
            }
            database.prepareStatement("SELECT * FROM admin_alerts WHERE id = ?").use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { rows -> if (rows.next()) rows.toAlert() else null }
            }
        }

    /** Includes archived alerts, which findAlert hides. */
    fun alertExists(id: String): Boolean =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT 1 FROM admin_alerts WHERE id = ?").use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { it.next() }
            }
        }

    fun findAlert(id: String): AdminAlertRecord? =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT * FROM admin_alerts WHERE id = ? AND deleted = 0").use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { rows -> if (rows.next()) rows.toAlert() else null }
            }
        }

    /** Only manual alerts: automatic ones are rebuilt from evidence on every refresh and would lose the edit. */
    fun updateManualContent(id: String, title: String, description: String, severity: String, dueDate: String?): Boolean =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                "UPDATE admin_alerts SET title = ?, description = ?, severity = ?, due_date = ? WHERE id = ? AND source = 'MANUAL' AND deleted = 0",
            ).use {
                it.setString(1, title); it.setString(2, description); it.setString(3, severity); it.setString(4, dueDate); it.setString(5, id)
                it.executeUpdate() == 1
            }
        }

    /** What a supplier may see: its own alerts that are marked visible, not archived or deleted. */
    fun supplierAlerts(supplierId: String): List<AdminAlertRecord> =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                "SELECT * FROM admin_alerts WHERE supplier_id = ? AND visible_to_supplier = 1 AND deleted = 0 ORDER BY created_at DESC",
            ).use { statement ->
                statement.setString(1, supplierId)
                statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.toAlert()) } }
            }
        }

    /** One notification per recipient and alert; repeating the call is harmless. */
    fun addNotifications(recipientIds: List<String>, alert: AdminAlertRecord, type: String, message: String, now: Instant) {
        if (recipientIds.isEmpty()) return
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """INSERT OR IGNORE INTO notifications (id, recipient_user_id, alert_id, type, title, message, severity, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""".trimIndent(),
            ).use { statement ->
                recipientIds.forEach { recipient ->
                    statement.setString(1, UUID.randomUUID().toString())
                    statement.setString(2, recipient)
                    statement.setString(3, alert.id)
                    statement.setString(4, type)
                    statement.setString(5, alert.title)
                    statement.setString(6, message)
                    statement.setString(7, alert.severity)
                    statement.setString(8, now.toString())
                    statement.addBatch()
                }
                statement.executeBatch()
            }
        }
    }

    fun notificationsFor(userId: String, limit: Int = 50): List<NotificationRecord> =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """SELECT id, alert_id, type, title, message, severity, created_at, read_at FROM notifications
                    WHERE recipient_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?""".trimIndent(),
            ).use { statement ->
                statement.setString(1, userId)
                statement.setInt(2, limit)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) add(
                            NotificationRecord(
                                rows.getString("id"), rows.getString("alert_id"), rows.getString("type"), rows.getString("title"),
                                rows.getString("message"), rows.getString("severity"), rows.getString("created_at"), rows.getString("read_at") != null,
                            ),
                        )
                    }
                }
            }
        }

    /** Marks one notification read, only if it belongs to this user. */
    fun markNotificationRead(userId: String, id: String, now: Instant): Boolean =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_user_id = ?").use {
                it.setString(1, now.toString()); it.setString(2, id); it.setString(3, userId)
                it.executeUpdate() == 1
            }
        }

    fun markAllNotificationsRead(userId: String, now: Instant) {
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("UPDATE notifications SET read_at = ? WHERE recipient_user_id = ? AND read_at IS NULL").use {
                it.setString(1, now.toString()); it.setString(2, userId)
                it.executeUpdate()
            }
        }
    }

    fun archivedAlerts(): List<AdminAlertRecord> =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT * FROM admin_alerts WHERE archived_at IS NOT NULL ORDER BY archived_at DESC").use { statement ->
                statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.toAlert()) } }
            }
        }

    /** Archiving also sets deleted = 1, so a release that does not know about archive keeps hiding the alert. */
    fun archive(id: String, actorId: String, now: Instant): Boolean =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("UPDATE admin_alerts SET deleted = 1, archived_at = ?, archived_by = ? WHERE id = ? AND deleted = 0").use {
                it.setString(1, now.toString()); it.setString(2, actorId); it.setString(3, id)
                it.executeUpdate() == 1
            }
        }

    /** Only restores archived alerts; ones that were deleted before archive existed stay deleted. */
    fun restore(id: String): Boolean =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("UPDATE admin_alerts SET deleted = 0, archived_at = NULL, archived_by = NULL WHERE id = ? AND archived_at IS NOT NULL").use {
                it.setString(1, id)
                it.executeUpdate() == 1
            }
        }

    fun delete(id: String): Boolean =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("UPDATE admin_alerts SET deleted = 1 WHERE id = ? AND deleted = 0").use {
                it.setString(1, id)
                it.executeUpdate() == 1
            }
        }

    fun setLastSyncedAt(value: String) {
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """INSERT INTO admin_insights_metadata(name, value) VALUES ('last_synced_at', ?)
                    ON CONFLICT(name) DO UPDATE SET value = excluded.value""".trimIndent(),
            ).use {
                it.setString(1, value)
                it.executeUpdate()
            }
        }
    }

    /** When activity tracking started, so "no activity recorded" can say since when. Set once. */
    fun activityTrackingSince(now: Instant): String =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("INSERT OR IGNORE INTO admin_insights_metadata(name, value) VALUES ('activity_tracking_since', ?)").use {
                it.setString(1, now.toString()); it.executeUpdate()
            }
            database.prepareStatement("SELECT value FROM admin_insights_metadata WHERE name = 'activity_tracking_since'").use {
                it.executeQuery().use { rows -> rows.next(); rows.getString(1) }
            }
        }

    fun lastSyncedAt(): String? =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT value FROM admin_insights_metadata WHERE name = 'last_synced_at'").use {
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
            }
        }

    fun notesFor(supplierId: String, viewerId: String): List<SupplierNoteRecord> =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """SELECT id, supplier_id, author_id, author_name, visibility, text, alert_id, created_at
                    FROM supplier_notes
                    WHERE supplier_id = ? AND (visibility = 'INTERNAL' OR author_id = ?)
                    ORDER BY created_at DESC, rowid DESC""".trimIndent(),
            ).use { statement ->
                statement.setString(1, supplierId)
                statement.setString(2, viewerId)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) add(
                            SupplierNoteRecord(
                                id = rows.getString("id"),
                                supplierId = rows.getString("supplier_id"),
                                authorId = rows.getString("author_id"),
                                authorName = rows.getString("author_name"),
                                visibility = rows.getString("visibility"),
                                text = rows.getString("text"),
                                alertId = rows.getString("alert_id"),
                                createdAt = rows.getString("created_at"),
                            ),
                        )
                    }
                }
            }
        }

    fun addNote(
        supplierId: String,
        authorId: String,
        authorName: String,
        visibility: String,
        text: String,
        alertId: String?,
        now: Instant,
    ): SupplierNoteRecord {
        val note = SupplierNoteRecord(UUID.randomUUID().toString(), supplierId, authorId, authorName, visibility, text, alertId, now.toString())
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """INSERT INTO supplier_notes (id, supplier_id, author_id, author_name, visibility, text, alert_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""".trimIndent(),
            ).use { statement ->
                statement.setString(1, note.id)
                statement.setString(2, note.supplierId)
                statement.setString(3, note.authorId)
                statement.setString(4, note.authorName)
                statement.setString(5, note.visibility)
                statement.setString(6, note.text)
                statement.setString(7, note.alertId)
                statement.setString(8, note.createdAt)
                statement.executeUpdate()
            }
        }
        return note
    }

    fun supplierReviewStatuses(): Map<String, String> =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT supplier_id, status FROM supplier_review_statuses").use { statement ->
                statement.executeQuery().use { rows ->
                    buildMap { while (rows.next()) put(rows.getString("supplier_id"), rows.getString("status")) }
                }
            }
        }

    fun setSupplierReviewStatus(supplierId: String, status: String, actorId: String, now: Instant) {
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """INSERT INTO supplier_review_statuses(supplier_id, status, updated_at, updated_by)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(supplier_id) DO UPDATE SET
                      status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by""".trimIndent(),
            ).use { statement ->
                statement.setString(1, supplierId)
                statement.setString(2, status)
                statement.setString(3, now.toString())
                statement.setString(4, actorId)
                statement.executeUpdate()
            }
        }
    }

    private fun ResultSet.toAlert() = AdminAlertRecord(
        id = getString("id"),
        title = getString("title"),
        description = getString("description"),
        severity = getString("severity"),
        status = getString("status"),
        supplierId = getString("supplier_id"),
        category = getString("category"),
        findingType = getString("finding_type"),
        source = getString("source"),
        dueDate = getString("due_date"),
        affectedItemType = getString("affected_item_type"),
        affectedItemName = getString("affected_item_name"),
        reason = getString("reason"),
        createdAt = getString("created_at"),
        findingKey = getString("finding_key"),
        archivedAt = getString("archived_at"),
    )
}
