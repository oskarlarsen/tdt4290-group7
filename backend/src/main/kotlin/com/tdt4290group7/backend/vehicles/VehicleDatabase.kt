package com.tdt4290group7.backend.vehicles

import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

internal class VehicleStorageBusyException(cause: SQLiteException) : RuntimeException("Vehicle database is busy", cause)

internal class VehicleDatabase(path: Path) {
    private val databaseUrl: String
    init {
        val absolute = path.toAbsolutePath().normalize()
        Files.createDirectories(absolute.parent)
        databaseUrl = "jdbc:sqlite:$absolute"
        write { db ->
            val version = query(db, "PRAGMA user_version") { it.getInt(1) }.single()
            // Version 10 adds agreements.saksnr; versions 8 and 9 are upgraded in place below.
            check(version == 0 || version == 8 || version == 9 || version == 10) {
                "Incompatible vehicle database schema (version $version). Stop the backend and run scripts/reset-vehicle-data.ps1 after confirming that the data can be wiped."
            }
            if (version == 0) check(query(db, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'") { it.getString(1) }.isEmpty()) { "Vehicle database is not empty; run the development reset." }
            db.createStatement().use { statement ->
                vehicleSchemaStatements.forEach { statement.executeUpdate(it) }
            }
            // Columns added after a database was created; ADD COLUMN only, so older releases can still read the file.
            if (version != 0) addMissingColumns(db)
            db.createStatement().use { it.execute("PRAGMA user_version = 10") }
        }
    }

    private fun addMissingColumns(db: Connection) {
        val columnsByTable = mapOf(
            "agreements" to listOf(
                "requires_vehicles INTEGER NOT NULL DEFAULT 1 CHECK(requires_vehicles IN (0,1))",
                "requires_energy INTEGER NOT NULL DEFAULT 0 CHECK(requires_energy IN (0,1))",
                "requires_products INTEGER NOT NULL DEFAULT 0 CHECK(requires_products IN (0,1))",
                "saksnr TEXT"
            ),
            "change_agreements" to listOf(
                "requires_vehicles INTEGER NOT NULL DEFAULT 1 CHECK(requires_vehicles IN (0,1))",
                "requires_energy INTEGER NOT NULL DEFAULT 0 CHECK(requires_energy IN (0,1))",
                "requires_products INTEGER NOT NULL DEFAULT 0 CHECK(requires_products IN (0,1))",
                "saksnr TEXT"
            ),
            "vehicle_checks" to listOf("agreement_saksnr TEXT"),
            // The category (and so the weight class) Statens vegvesen gave when the fuel was filled in at upload.
            "vehicle_contract_details" to listOf("vehicle_category TEXT")
        )
        columnsByTable.forEach { (table, definitions) ->
            val existing = query(db, "PRAGMA table_info($table)") { it.getString("name") }.toSet()
            definitions.forEach { definition ->
                val column = definition.substringBefore(' ')
                if (column !in existing) db.createStatement().use { it.execute("ALTER TABLE $table ADD COLUMN $definition") }
            }
        }
    }
    private fun connection(): Connection = DriverManager.getConnection(databaseUrl).also { db ->
        db.createStatement().use {
            it.execute("PRAGMA foreign_keys = ON")
            it.execute("PRAGMA busy_timeout = 5000")
        }
    }

    /** One SQLite read snapshot keeps agreement evidence and historical summaries consistent. */
    fun <T> read(action: (Connection) -> T): T = connection().use { db ->
        db.autoCommit = false
        try { action(db) } finally { db.rollback() }
    }

    /** Reserve the writer before reading; preserve atomic batches and cross-process contention handling. */
    fun <T> write(action: (Connection) -> T): T = try {
        connection().use { db ->
            db.createStatement().use { it.execute("BEGIN IMMEDIATE") }
            try {
                val result = action(db)
                db.createStatement().use { it.execute("COMMIT") }
                result
            } catch (cause: Exception) {
                try {
                    db.createStatement().use { it.execute("ROLLBACK") }
                } catch (rollbackFailure: Exception) {
                    cause.addSuppressed(rollbackFailure)
                }
                throw cause
            }
        }
    } catch (cause: SQLiteException) {
        if ((cause.resultCode.code and 0xff) == SQLiteErrorCode.SQLITE_BUSY.code) {
            throw VehicleStorageBusyException(cause)
        }
        throw cause
    }

    /** Table/column names below come only from this repository's explicit allowlists. Values are bound. */
    fun insert(db: Connection, table: String, values: Map<String, Any?>) {
        val columns = values.keys.joinToString(",")
        val placeholders = values.keys.joinToString(",") { "?" }
        db.prepareStatement("INSERT INTO $table ($columns) VALUES ($placeholders)").use {
            values.values.forEachIndexed { index, value -> it.setObject(index + 1, value) }
            it.executeUpdate()
        }
    }

    fun update(db: Connection, table: String, values: Map<String, Any?>, where: String, parameters: List<Any?>) {
        val assignments = values.keys.joinToString(",") { "$it = ?" }
        db.prepareStatement("UPDATE $table SET $assignments WHERE $where").use {
            (values.values + parameters).forEachIndexed { index, value -> it.setObject(index + 1, value) }
            it.executeUpdate()
        }
    }

    fun <T> query(db: Connection, sql: String, parameters: List<Any?> = emptyList(), map: (ResultSet) -> T): List<T> =
        db.prepareStatement(sql).use { statement ->
            parameters.forEachIndexed { index, value -> statement.setObject(index + 1, value) }
            statement.executeQuery().use { rows -> buildList { while (rows.next()) add(map(rows)) } }
        }
}
