package com.tdt4290group7.backend.admin

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
)

class AdminInsightsRepository(databasePath: Path) {
    private val databaseUrl: String

    init {
        val path = databasePath.toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = "jdbc:sqlite:$path"
        DriverManager.getConnection(databaseUrl).use { database ->
            database.createStatement().use { statement ->
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS admin_alerts (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT NOT NULL,
                        severity TEXT NOT NULL,
                        status TEXT NOT NULL,
                        supplier_id TEXT,
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
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS admin_insights_metadata (
                        name TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )""".trimIndent(),
                )
                statement.execute(
                    """CREATE TABLE IF NOT EXISTS supplier_review_statuses (
                        supplier_id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        updated_by TEXT NOT NULL
                    )""".trimIndent(),
                )
            }
        }
    }

    fun upsertFinding(record: AdminAlertRecord) {
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement(
                """INSERT INTO admin_alerts
                    (id, title, description, severity, status, supplier_id, category, finding_type, source,
                     due_date, affected_item_type, affected_item_name, reason, created_at, finding_key)
                    VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, 'AUTOMATIC', ?, ?, ?, ?, ?, ?)
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
                      reason = excluded.reason
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
                "UPDATE admin_alerts SET status = 'RESOLVED' WHERE finding_key = ? AND status != 'RESOLVED'",
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
                     due_date, affected_item_type, affected_item_name, reason, created_at, finding_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".trimIndent(),
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
            database.prepareStatement("UPDATE admin_alerts SET status = ? WHERE id = ? AND deleted = 0").use {
                it.setString(1, status)
                it.setString(2, id)
                if (it.executeUpdate() != 1) return null
            }
            database.prepareStatement("SELECT * FROM admin_alerts WHERE id = ?").use { statement ->
                statement.setString(1, id)
                statement.executeQuery().use { rows -> if (rows.next()) rows.toAlert() else null }
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

    fun lastSyncedAt(): String? =
        DriverManager.getConnection(databaseUrl).use { database ->
            database.prepareStatement("SELECT value FROM admin_insights_metadata WHERE name = 'last_synced_at'").use {
                it.executeQuery().use { rows -> if (rows.next()) rows.getString(1) else null }
            }
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
    )
}
