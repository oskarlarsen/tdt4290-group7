package com.tdt4290group7.backend

import com.tdt4290group7.backend.admin.AdminInsightsRepository
import com.tdt4290group7.backend.certificates.CertificateRepository
import com.tdt4290group7.backend.repository.createUserTables
import com.tdt4290group7.backend.vehicles.VehicleDatabase
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant
import org.slf4j.LoggerFactory

/**
 * One-time merge of the four old SQLite files (vehicles, users, certificates, admin-insights) into the single database.
 * It builds `<db>.tmp` next to the target, checks every link, and only then renames it into place; the old files are
 * only read, then renamed to `*.pre-merge`. Any failure leaves them untouched and stops startup.
 */
internal object LegacyDatabaseMerge {
    private val log = LoggerFactory.getLogger(LegacyDatabaseMerge::class.java)
    private const val MARKER = "legacy_merge"

    internal class LegacyFiles(val vehicles: Path, val users: Path, val certificates: Path, val insights: Path) {
        val all get() = listOf(vehicles, users, certificates, insights)
    }

    /** Old files sit next to the new one, or where the old *_DB_PATH settings pointed. */
    fun legacyFiles(target: Path): LegacyFiles {
        fun at(variable: String, name: String) =
            (backendSetting(variable)?.let { Path.of(it) } ?: target.resolveSibling(name)).toAbsolutePath().normalize()
        return LegacyFiles(at("VEHICLE_DB_PATH", "vehicles.db"), at("USER_DB_PATH", "users.db"),
            at("CERTIFICATE_DB_PATH", "certificates.db"), at("ADMIN_INSIGHTS_DB_PATH", "admin-insights.db"))
    }

    // Parents before children, and each table with the old file it came from.
    private val copyOrder = listOf(
        "users" to "users", "supplier_invitations" to "users", "access_invitations" to "users",
        "certificates" to "certificates",
        "admin_alerts" to "insights", "admin_insights_metadata" to "insights", "supplier_notes" to "insights",
        "supplier_review_statuses" to "insights", "notifications" to "insights",
    )

    fun run(target: Path, legacy: LegacyFiles = legacyFiles(target)) {
        val present = legacy.all.filter(Files::exists)
        if (present.isEmpty()) return
        if (Files.exists(target)) {
            // Merged earlier but stopped before renaming the old files: finish that. A target without the marker was
            // not made by a merge (fresh install), so the old files are left alone.
            if (hasMarker(target)) present.forEach(::retire)
            return
        }
        val temp = target.resolveSibling(target.fileName.toString() + ".tmp")
        deleteWithSidecars(temp)
        Files.createDirectories(target.parent)
        try {
            build(temp, legacy)
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE)
        } catch (failure: Exception) {
            deleteWithSidecars(temp)
            throw IllegalStateException("Could not merge the old databases into $target; nothing was changed. ${failure.message}", failure)
        }
        present.forEach(::retire)
        log.info("Merged ${present.size} old database file(s) into $target; the old files were renamed to *.pre-merge")
    }

    private fun build(temp: Path, legacy: LegacyFiles) {
        if (Files.exists(legacy.vehicles)) Files.copy(legacy.vehicles, temp)
        try {
            VehicleDatabase(temp) // creates the vehicle tables, or upgrades the copied vehicles.db in place
        } catch (failure: IllegalStateException) {
            // The vehicle database's own message talks about the temporary copy; name the real file instead.
            throw IllegalStateException("The old vehicle database ${legacy.vehicles} cannot be used: ${failure.message?.substringBefore(" Stop the backend")} " +
                "Stop the backend, move that file away after confirming its data can be wiped, and start again.", failure)
        }
        DriverManager.getConnection("jdbc:sqlite:$temp").use { createUserTables(it) }
        CertificateRepository(temp)
        AdminInsightsRepository(temp)

        val sources = mapOf("users" to legacy.users, "certificates" to legacy.certificates, "insights" to legacy.insights)
            .filterValues(Files::exists)
        DriverManager.getConnection("jdbc:sqlite:$temp").use { db ->
            // Keys stay off while copying; foreign_key_check below verifies every row at once.
            db.createStatement().use { it.execute("PRAGMA foreign_keys = OFF") }
            sources.forEach { (alias, path) ->
                db.prepareStatement("ATTACH DATABASE ? AS old_$alias").use { it.setString(1, path.toString()); it.execute() }
            }
            db.autoCommit = false
            for ((table, alias) in copyOrder) {
                if (alias !in sources || !hasTable(db, "old_$alias", table)) continue
                val old = "old_$alias"
                val columns = columns(db, "main", table).intersect(columns(db, old, table).toSet()).toList()
                require(columns.isNotEmpty()) { "No common columns for $table" }
                val list = columns.joinToString(",")
                db.createStatement().use { it.executeUpdate("INSERT INTO main.$table ($list) SELECT $list FROM $old.$table") }
                val before = count(db, "$old.$table")
                val after = count(db, "main.$table")
                check(before == after) { "$table: $before rows in the old file, $after copied" }
                log.info("Merged {} rows of {}", after, table)
            }
            val violations = db.createStatement().use { statement ->
                statement.executeQuery("PRAGMA main.foreign_key_check").use { rows ->
                    buildList { while (rows.next()) add("${rows.getString(1)} row ${rows.getLong(2)} points at a missing row in ${rows.getString(3)}") }
                }
            }
            check(violations.isEmpty()) {
                "Broken links in the old data (fix or remove these rows and start again): " + violations.take(20).joinToString("; ") +
                    if (violations.size > 20) " ... and ${violations.size - 20} more" else ""
            }
            // Names copied onto invitations and certificates may be stale after earlier renames.
            syncSupplierNames(db)
            // Until now an archived supplier's users were blocked only by the supplier's own flag; reactivating the supplier
            // must not let them back in, so give them an ended access date.
            val mergedAt = Instant.now().toString()
            db.prepareStatement("UPDATE users SET access_expires_at = ? WHERE role = 'SUPPLIER' AND is_permanent = 0 AND supplier_id IN (SELECT id FROM suppliers WHERE active = 0)").use {
                it.setString(1, mergedAt); it.executeUpdate()
            }
            db.prepareStatement("INSERT OR REPLACE INTO admin_insights_metadata (name, value) VALUES (?, ?)").use {
                it.setString(1, MARKER); it.setString(2, Instant.now().toString()); it.executeUpdate()
            }
            db.commit()
            db.autoCommit = true
            val integrity = db.createStatement().use { it.executeQuery("PRAGMA main.integrity_check").use { rows -> rows.next(); rows.getString(1) } }
            check(integrity == "ok") { "integrity_check: $integrity" }
        }
    }

    private fun hasTable(db: Connection, schema: String, table: String) =
        db.prepareStatement("SELECT 1 FROM $schema.sqlite_master WHERE type = 'table' AND name = ?").use { statement ->
            statement.setString(1, table); statement.executeQuery().use { it.next() }
        }

    private fun columns(db: Connection, schema: String, table: String) =
        db.createStatement().use { statement ->
            statement.executeQuery("PRAGMA $schema.table_info($table)").use { rows -> buildList { while (rows.next()) add(rows.getString("name")) } }
        }

    private fun count(db: Connection, qualified: String) =
        db.createStatement().use { it.executeQuery("SELECT count(*) FROM $qualified").use { rows -> rows.next(); rows.getLong(1) } }

    private fun hasMarker(target: Path) = runCatching {
        DriverManager.getConnection("jdbc:sqlite:$target").use { db ->
            db.prepareStatement("SELECT 1 FROM admin_insights_metadata WHERE name = ?").use { statement ->
                statement.setString(1, MARKER); statement.executeQuery().use { it.next() }
            }
        }
    }.getOrDefault(false)

    private fun retire(file: Path) {
        var destination = file.resolveSibling(file.fileName.toString() + ".pre-merge")
        if (Files.exists(destination)) destination = file.resolveSibling(file.fileName.toString() + ".pre-merge-" + System.currentTimeMillis())
        Files.move(file, destination)
    }

    private fun deleteWithSidecars(file: Path) =
        listOf("", "-wal", "-shm", "-journal").forEach { Files.deleteIfExists(file.resolveSibling(file.fileName.toString() + it)) }
}
