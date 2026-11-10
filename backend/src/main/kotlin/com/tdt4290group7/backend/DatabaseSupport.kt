package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager

/** The one database file: every repository stores its tables here. */
internal fun databasePath(): Path = Path.of(backendSetting("DATABASE_PATH") ?: "data/app.db").toAbsolutePath().normalize()

/**
 * " REFERENCES table(column)" for a link to another repository's table, or "" when this file has no suppliers table.
 * shortcut: the keys exist only where the vehicle schema is in the same file (the app creates it first); tests that
 * give each repository its own file get no keys. Upgrade when every repository shares one schema class.
 */
internal fun Connection.link(table: String, column: String = "id"): String =
    prepareStatement("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'suppliers'").use { statement ->
        statement.executeQuery().use { if (it.next()) " REFERENCES $table($column)" else "" }
    }

/** WAL lets readers and the single writer work at the same time; without it one shared file locks under load. */
internal fun enableWal(path: Path) {
    Files.createDirectories(path.parent)
    DriverManager.getConnection("jdbc:sqlite:$path").use { it.createStatement().use { statement -> statement.execute("PRAGMA journal_mode = WAL") } }
}

/** Repositories without a connection helper open plain connections; these settings match the vehicle and user ones. */
internal fun jdbcUrl(path: Path) = "jdbc:sqlite:$path?foreign_keys=true&busy_timeout=5000"

internal fun Connection.hasTable(name: String): Boolean =
    prepareStatement("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").use { statement ->
        statement.setString(1, name); statement.executeQuery().use { it.next() }
    }

/**
 * Ends the access of every account of an archived supplier and drops its open invitations, inside the caller's transaction.
 * Setting access_expires_at is what login and Security.validate already check on every request. Accounts stay for history.
 * shortcut: does nothing when the account tables are in another file (tests); undoing the removal does not unblock them, so an
 * admin re-invites. Upgrade when users should come back automatically (needs the previous end date kept somewhere).
 */
internal fun blockSupplierAccounts(db: Connection, supplierId: String, at: String) {
    if (!db.hasTable("users")) return
    db.prepareStatement("UPDATE users SET access_expires_at = ? WHERE supplier_id = ? AND role = 'SUPPLIER' AND is_permanent = 0").use {
        it.setString(1, at); it.setString(2, supplierId); it.executeUpdate()
    }
    listOf("supplier_invitations", "access_invitations").forEach { table ->
        db.prepareStatement("DELETE FROM $table WHERE supplier_id = ? AND accepted_at IS NULL").use { it.setString(1, supplierId); it.executeUpdate() }
    }
}

/**
 * Invitations and certificates keep a copy of the supplier's name for display. Brings those copies back in line with the
 * suppliers table (all of them, or one supplier), inside the caller's transaction. A certificate is tied to a supplier through
 * its agreement; one without an agreement has a free-text name and is left alone. Does nothing for tables that are in another file.
 */
internal fun syncSupplierNames(db: Connection, supplierId: String? = null) {
    val only = if (supplierId == null) "" else " AND supplier_id = ?"
    fun run(sql: String) = db.prepareStatement(sql).use { statement -> if (supplierId != null) statement.setString(1, supplierId); statement.executeUpdate() }
    listOf("supplier_invitations", "access_invitations").filter(db::hasTable).forEach { table ->
        run("UPDATE $table SET supplier_name = (SELECT name FROM suppliers WHERE suppliers.id = $table.supplier_id) WHERE supplier_id IN (SELECT id FROM suppliers)$only")
    }
    if (db.hasTable("certificates")) {
        run("UPDATE certificates SET supplier_name = (SELECT s.name FROM agreements a JOIN suppliers s ON s.id = a.supplier_id WHERE a.id = certificates.contract_id) " +
            "WHERE contract_id IN (SELECT id FROM agreements" + (if (supplierId == null) "" else " WHERE supplier_id = ?") + ")")
    }
}
