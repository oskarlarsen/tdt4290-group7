package com.tdt4290group7.backend.vehicles

import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeParseException
import java.util.UUID
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

interface VehicleStore {
    fun insertImport(request: VehicleImportRequest): VehicleImportResponse
    fun findImport(id: String): VehicleImportResponse?
    fun rowsForImport(id: String): List<StoredVehicleRow>
    fun insertApprovedImport(request: ApprovedVehicleImportRequest): ApprovedVehicleImportResponse
    fun findApprovedImport(id: String): ApprovedVehicleImportResponse?
    fun approvedRowsForImport(id: String): List<StoredApprovedVehicleRow>
    fun saveComparison(comparison: VehicleComparisonResponse)
    fun findComparison(id: String): VehicleComparisonResponse?
    fun saveCheckRun(run: VehicleCheckRunResponse, snapshots: List<RegistrySnapshot>)
    fun latestCheckRun(importId: String): VehicleCheckRunResponse?
    fun findSnapshot(id: String): RegistrySnapshot?
}

class VehicleRepository(databasePath: Path) : VehicleStore {
    private val databaseUrl: String
    // Legacy development rows may still contain the former per-trip "approved" field.
    private val json = Json { ignoreUnknownKeys = true }

    init {
        val path = databasePath.toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = "jdbc:sqlite:$path"
        connection().use { db ->
            db.createStatement().use { statement ->
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_imports (
                        id TEXT PRIMARY KEY,
                        source_name TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        row_count INTEGER NOT NULL,
                        distinct_vehicle_count INTEGER NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_rows (
                        id TEXT PRIMARY KEY,
                        import_id TEXT NOT NULL REFERENCES vehicle_imports(id),
                        row_number INTEGER NOT NULL,
                        normalized_registration_number TEXT NOT NULL,
                        approved INTEGER NOT NULL,
                        data_json TEXT NOT NULL,
                        UNIQUE(import_id, row_number)
                    )""",
                )
                statement.executeUpdate(
                    "CREATE INDEX IF NOT EXISTS idx_vehicle_rows_import_plate ON vehicle_rows(import_id, normalized_registration_number)",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS approved_vehicle_imports (
                        id TEXT PRIMARY KEY,
                        source_name TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        row_count INTEGER NOT NULL,
                        distinct_vehicle_count INTEGER NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS approved_vehicle_rows (
                        id TEXT PRIMARY KEY,
                        import_id TEXT NOT NULL REFERENCES approved_vehicle_imports(id),
                        row_number INTEGER NOT NULL,
                        normalized_registration_number TEXT NOT NULL,
                        data_json TEXT NOT NULL,
                        UNIQUE(import_id, row_number)
                    )""",
                )
                statement.executeUpdate(
                    "CREATE INDEX IF NOT EXISTS idx_approved_rows_import_plate ON approved_vehicle_rows(import_id, normalized_registration_number)",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_comparisons (
                        id TEXT PRIMARY KEY,
                        trip_import_id TEXT NOT NULL REFERENCES vehicle_imports(id),
                        approved_import_id TEXT NOT NULL REFERENCES approved_vehicle_imports(id),
                        created_at TEXT NOT NULL,
                        compared_vehicle_count INTEGER NOT NULL,
                        unapproved_vehicle_count INTEGER NOT NULL,
                        results_json TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS registry_snapshots (
                        id TEXT PRIMARY KEY,
                        normalized_registration_number TEXT NOT NULL,
                        fetched_at TEXT NOT NULL,
                        source TEXT NOT NULL,
                        registration_status TEXT,
                        data_json TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_check_runs (
                        id TEXT PRIMARY KEY,
                        import_id TEXT NOT NULL REFERENCES vehicle_imports(id),
                        started_at TEXT NOT NULL,
                        completed_at TEXT NOT NULL,
                        checked_count INTEGER NOT NULL,
                        deviation_count INTEGER NOT NULL,
                        unavailable_count INTEGER NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_check_results (
                        run_id TEXT NOT NULL REFERENCES vehicle_check_runs(id),
                        normalized_registration_number TEXT NOT NULL,
                        data_json TEXT NOT NULL,
                        PRIMARY KEY(run_id, normalized_registration_number)
                    )""",
                )
            }
        }
    }

    private fun connection(): Connection = DriverManager.getConnection(databaseUrl).also { db ->
        db.createStatement().use { statement ->
            statement.execute("PRAGMA foreign_keys = ON")
            statement.execute("PRAGMA busy_timeout = 5000")
        }
    }

    override fun insertImport(request: VehicleImportRequest): VehicleImportResponse {
        validateImport(request.sourceName, request.rows.size)
        val plates = validatePlates(request.rows.map { it.registrationNumber })
        val response = VehicleImportResponse(
            id = UUID.randomUUID().toString(),
            sourceName = request.sourceName.trim(),
            createdAt = Instant.now().toString(),
            rowCount = request.rows.size,
            distinctVehicleCount = plates.distinct().size,
        )
        connection().use { db ->
            db.autoCommit = false
            try {
                db.prepareStatement(
                    "INSERT INTO vehicle_imports (id, source_name, created_at, row_count, distinct_vehicle_count) VALUES (?, ?, ?, ?, ?)",
                ).use { statement ->
                    statement.setString(1, response.id)
                    statement.setString(2, response.sourceName)
                    statement.setString(3, response.createdAt)
                    statement.setInt(4, response.rowCount)
                    statement.setInt(5, response.distinctVehicleCount)
                    statement.executeUpdate()
                }
                db.prepareStatement(
                    "INSERT INTO vehicle_rows (id, import_id, row_number, normalized_registration_number, approved, data_json) VALUES (?, ?, ?, ?, ?, ?)",
                ).use { statement ->
                    request.rows.forEachIndexed { index, row ->
                        statement.setString(1, UUID.randomUUID().toString())
                        statement.setString(2, response.id)
                        statement.setInt(3, index + 1)
                        statement.setString(4, plates[index])
                        // Retained schema column for existing SQLite databases; approval is list-based.
                        statement.setInt(5, 0)
                        statement.setString(6, json.encodeToString(row))
                        statement.addBatch()
                    }
                    statement.executeBatch()
                }
                db.commit()
            } catch (cause: Exception) {
                db.rollback()
                throw cause
            }
        }
        return response
    }

    override fun findImport(id: String): VehicleImportResponse? = connection().use { db ->
        db.prepareStatement(
            "SELECT id, source_name, created_at, row_count, distinct_vehicle_count FROM vehicle_imports WHERE id = ?",
        ).use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                if (!rows.next()) return@use null
                VehicleImportResponse(
                    id = rows.getString("id"),
                    sourceName = rows.getString("source_name"),
                    createdAt = rows.getString("created_at"),
                    rowCount = rows.getInt("row_count"),
                    distinctVehicleCount = rows.getInt("distinct_vehicle_count"),
                )
            }
        }
    }

    override fun rowsForImport(id: String): List<StoredVehicleRow> = connection().use { db ->
        db.prepareStatement(
            "SELECT id, import_id, row_number, normalized_registration_number, data_json FROM vehicle_rows WHERE import_id = ? ORDER BY row_number",
        ).use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            StoredVehicleRow(
                                id = rows.getString("id"),
                                importId = rows.getString("import_id"),
                                rowNumber = rows.getInt("row_number"),
                                normalizedRegistrationNumber = rows.getString("normalized_registration_number"),
                                data = json.decodeFromString<VehicleRowInput>(rows.getString("data_json")),
                            ),
                        )
                    }
                }
            }
        }
    }

    override fun insertApprovedImport(request: ApprovedVehicleImportRequest): ApprovedVehicleImportResponse {
        validateImport(request.sourceName, request.rows.size)
        val plates = validatePlates(request.rows.map { it.registrationNumber })
        request.rows.forEachIndexed { index, row ->
            listOf("startDate" to row.startDate, "endDate" to row.endDate).forEach { (field, value) ->
                if (value != null) try {
                    LocalDate.parse(value)
                } catch (_: DateTimeParseException) {
                    throw IllegalArgumentException("rows[$index].$field must be an ISO date (yyyy-MM-dd)")
                }
            }
        }
        val response = ApprovedVehicleImportResponse(
            UUID.randomUUID().toString(), request.sourceName.trim(), Instant.now().toString(),
            request.rows.size, plates.distinct().size,
        )
        connection().use { db ->
            db.autoCommit = false
            try {
                db.prepareStatement(
                    "INSERT INTO approved_vehicle_imports VALUES (?, ?, ?, ?, ?)",
                ).use { statement ->
                    statement.setString(1, response.id)
                    statement.setString(2, response.sourceName)
                    statement.setString(3, response.createdAt)
                    statement.setInt(4, response.rowCount)
                    statement.setInt(5, response.distinctVehicleCount)
                    statement.executeUpdate()
                }
                db.prepareStatement(
                    "INSERT INTO approved_vehicle_rows VALUES (?, ?, ?, ?, ?)",
                ).use { statement ->
                    request.rows.forEachIndexed { index, row ->
                        statement.setString(1, UUID.randomUUID().toString())
                        statement.setString(2, response.id)
                        statement.setInt(3, index + 1)
                        statement.setString(4, plates[index])
                        statement.setString(5, json.encodeToString(row))
                        statement.addBatch()
                    }
                    statement.executeBatch()
                }
                db.commit()
            } catch (cause: Exception) {
                db.rollback()
                throw cause
            }
        }
        return response
    }

    override fun findApprovedImport(id: String): ApprovedVehicleImportResponse? = connection().use { db ->
        db.prepareStatement("SELECT * FROM approved_vehicle_imports WHERE id = ?").use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                if (!rows.next()) return@use null
                ApprovedVehicleImportResponse(
                    rows.getString("id"), rows.getString("source_name"), rows.getString("created_at"),
                    rows.getInt("row_count"), rows.getInt("distinct_vehicle_count"),
                )
            }
        }
    }

    override fun approvedRowsForImport(id: String): List<StoredApprovedVehicleRow> = connection().use { db ->
        db.prepareStatement("SELECT * FROM approved_vehicle_rows WHERE import_id = ? ORDER BY row_number").use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) add(
                        StoredApprovedVehicleRow(
                            rows.getString("id"), rows.getString("import_id"), rows.getInt("row_number"),
                            rows.getString("normalized_registration_number"),
                            json.decodeFromString<ApprovedVehicleRowInput>(rows.getString("data_json")),
                        ),
                    )
                }
            }
        }
    }

    override fun saveComparison(comparison: VehicleComparisonResponse) {
        connection().use { db ->
            db.prepareStatement("INSERT INTO vehicle_comparisons VALUES (?, ?, ?, ?, ?, ?, ?)").use { statement ->
                statement.setString(1, comparison.id)
                statement.setString(2, comparison.tripImportId)
                statement.setString(3, comparison.approvedImportId)
                statement.setString(4, comparison.createdAt)
                statement.setInt(5, comparison.comparedVehicleCount)
                statement.setInt(6, comparison.unapprovedVehicleCount)
                statement.setString(7, json.encodeToString(comparison.results))
                statement.executeUpdate()
            }
        }
    }

    override fun findComparison(id: String): VehicleComparisonResponse? = connection().use { db ->
        db.prepareStatement("SELECT * FROM vehicle_comparisons WHERE id = ?").use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                if (!rows.next()) return@use null
                VehicleComparisonResponse(
                    rows.getString("id"), rows.getString("trip_import_id"), rows.getString("approved_import_id"),
                    rows.getString("created_at"), rows.getInt("compared_vehicle_count"),
                    rows.getInt("unapproved_vehicle_count"),
                    json.decodeFromString<List<VehicleComparisonResult>>(rows.getString("results_json")),
                )
            }
        }
    }

    private fun validateImport(sourceName: String, rowCount: Int) {
        require(sourceName.isNotBlank()) { "sourceName is required" }
        require(rowCount > 0) { "rows must not be empty" }
        require(rowCount <= 10_000) { "imports are limited to 10000 rows" }
    }

    private fun validatePlates(registrationNumbers: List<String>): List<String> =
        registrationNumbers.mapIndexed { index, number ->
            normalizeRegistrationNumber(number).also { plate ->
                require(plate.matches(Regex("[A-Z0-9]{2,7}"))) {
                    "rows[$index].registrationNumber must be a 2-7 character Norwegian plate"
                }
            }
        }

    override fun saveCheckRun(run: VehicleCheckRunResponse, snapshots: List<RegistrySnapshot>) {
        connection().use { db ->
            db.autoCommit = false
            try {
                db.prepareStatement(
                    "INSERT INTO registry_snapshots (id, normalized_registration_number, fetched_at, source, registration_status, data_json) VALUES (?, ?, ?, ?, ?, ?)",
                ).use { statement ->
                    snapshots.forEach { snapshot ->
                        statement.setString(1, snapshot.id)
                        statement.setString(2, snapshot.normalizedRegistrationNumber)
                        statement.setString(3, snapshot.fetchedAt)
                        statement.setString(4, snapshot.source)
                        statement.setString(5, snapshot.registrationStatus)
                        statement.setString(6, json.encodeToString(snapshot.data))
                        statement.addBatch()
                    }
                    statement.executeBatch()
                }
                db.prepareStatement(
                    "INSERT INTO vehicle_check_runs (id, import_id, started_at, completed_at, checked_count, deviation_count, unavailable_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ).use { statement ->
                    statement.setString(1, run.id)
                    statement.setString(2, run.importId)
                    statement.setString(3, run.startedAt)
                    statement.setString(4, run.completedAt)
                    statement.setInt(5, run.checkedCount)
                    statement.setInt(6, run.deviationCount)
                    statement.setInt(7, run.unavailableCount)
                    statement.executeUpdate()
                }
                db.prepareStatement(
                    "INSERT INTO vehicle_check_results (run_id, normalized_registration_number, data_json) VALUES (?, ?, ?)",
                ).use { statement ->
                    run.results.forEach { result ->
                        statement.setString(1, run.id)
                        statement.setString(2, result.normalizedRegistrationNumber)
                        statement.setString(3, json.encodeToString(result))
                        statement.addBatch()
                    }
                    statement.executeBatch()
                }
                db.commit()
            } catch (cause: Exception) {
                db.rollback()
                throw cause
            }
        }
    }

    override fun latestCheckRun(importId: String): VehicleCheckRunResponse? = connection().use { db ->
        db.prepareStatement(
            "SELECT * FROM vehicle_check_runs WHERE import_id = ? ORDER BY completed_at DESC LIMIT 1",
        ).use { statement ->
            statement.setString(1, importId)
            statement.executeQuery().use { runs ->
                if (!runs.next()) return@use null
                val runId = runs.getString("id")
                val results = db.prepareStatement(
                    "SELECT data_json FROM vehicle_check_results WHERE run_id = ? ORDER BY normalized_registration_number",
                ).use { resultStatement ->
                    resultStatement.setString(1, runId)
                    resultStatement.executeQuery().use { resultRows ->
                        buildList {
                            while (resultRows.next()) {
                                add(json.decodeFromString<VehicleCheckResult>(resultRows.getString("data_json")))
                            }
                        }
                    }
                }
                VehicleCheckRunResponse(
                    id = runId,
                    importId = importId,
                    startedAt = runs.getString("started_at"),
                    completedAt = runs.getString("completed_at"),
                    checkedCount = runs.getInt("checked_count"),
                    deviationCount = runs.getInt("deviation_count"),
                    unavailableCount = runs.getInt("unavailable_count"),
                    results = results,
                )
            }
        }
    }

    override fun findSnapshot(id: String): RegistrySnapshot? = connection().use { db ->
        db.prepareStatement("SELECT * FROM registry_snapshots WHERE id = ?").use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                if (!rows.next()) return@use null
                RegistrySnapshot(
                    id = rows.getString("id"),
                    normalizedRegistrationNumber = rows.getString("normalized_registration_number"),
                    fetchedAt = rows.getString("fetched_at"),
                    source = rows.getString("source"),
                    registrationStatus = rows.getString("registration_status"),
                    data = json.decodeFromString<RegistryValue>(rows.getString("data_json")),
                )
            }
        }
    }
}
