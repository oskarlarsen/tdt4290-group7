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
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

internal class VehicleStorageBusyException(cause: SQLiteException) :
    RuntimeException("Vehicle database is busy", cause)

interface VehicleStore {
    fun findOrCreateVehicle(registrationNumber: String, now: Instant): Vehicle
    fun appendTripRows(request: AppendTripRowsRequest, now: Instant): AppendTripRowsResponse
    fun tripRowsForVehicle(vehicleId: String): List<StoredTripRow>
    fun upsertApprovals(request: UpsertApprovalsRequest, now: Instant): UpsertApprovalsResponse
    fun approvalForVehicle(vehicleId: String): StoredApproval?
    fun revokeApproval(registrationNumber: String, now: Instant): StoredApproval?
    fun latestSnapshot(vehicleId: String): RegistrySnapshot?
    fun saveCheck(check: VehicleCheckResponse, newSnapshot: RegistrySnapshot?)
    fun findCheck(id: String): VehicleCheckResponse?
}
class VehicleRepository(databasePath: Path) : VehicleStore {
    private val databaseUrl: String
    private val json = Json { ignoreUnknownKeys = false }

    init {
        val path = databasePath.toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = "jdbc:sqlite:$path"
        connection().use { db ->
            db.createStatement().use { statement ->
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS suppliers (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicles (
                        id TEXT PRIMARY KEY,
                        normalized_registration_number TEXT NOT NULL UNIQUE,
                        supplier_id TEXT REFERENCES suppliers(id),
                        created_at TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS trip_rows (
                        id TEXT PRIMARY KEY,
                        vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                        source_name TEXT,
                        created_at TEXT NOT NULL,
                        data_json TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate("CREATE INDEX IF NOT EXISTS idx_trip_rows_vehicle ON trip_rows(vehicle_id)")
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_approvals (
                        id TEXT PRIMARY KEY,
                        vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                        source_name TEXT,
                        start_date TEXT,
                        expiry_date TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        revoked_at TEXT,
                        data_json TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_unrevoked_approval ON vehicle_approvals(vehicle_id) WHERE revoked_at IS NULL",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS svv_snapshots (
                        id TEXT PRIMARY KEY,
                        vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                        fetched_at TEXT NOT NULL,
                        source TEXT NOT NULL,
                        registration_status TEXT,
                        data_json TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    "CREATE INDEX IF NOT EXISTS idx_svv_snapshots_vehicle_time ON svv_snapshots(vehicle_id, fetched_at DESC)",
                )
                statement.executeUpdate(
                    """CREATE TABLE IF NOT EXISTS vehicle_checks (
                        id TEXT PRIMARY KEY,
                        vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
                        approval_id TEXT REFERENCES vehicle_approvals(id),
                        snapshot_id TEXT REFERENCES svv_snapshots(id),
                        checked_at TEXT NOT NULL,
                        data_json TEXT NOT NULL
                    )""",
                )
                statement.executeUpdate(
                    "CREATE INDEX IF NOT EXISTS idx_vehicle_checks_vehicle_time ON vehicle_checks(vehicle_id, checked_at DESC)",
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

    /** Reserve the writer before reading; keep each batch atomic across connections/processes. */
    private fun <T> writeTransaction(action: (Connection) -> T): T = try {
        connection().use { db ->
            // JDBC commit()/rollback() in this driver start another transaction afterwards.
            // Explicit transaction statements finish this operation without reacquiring a lock.
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
        // Include extended SQLITE_BUSY codes, without treating other SQL failures as contention.
        if ((cause.resultCode.code and 0xff) == SQLiteErrorCode.SQLITE_BUSY.code) {
            throw VehicleStorageBusyException(cause)
        }
        throw cause
    }

    override fun findOrCreateVehicle(registrationNumber: String, now: Instant): Vehicle = writeTransaction { db ->
        findOrCreateVehicle(db, validatedPlate(registrationNumber), now)
    }

    override fun appendTripRows(request: AppendTripRowsRequest, now: Instant): AppendTripRowsResponse {
        validateBatch(request.rows.size)
        val sourceName = request.sourceName?.trim()?.takeIf(String::isNotEmpty)
        val plates = request.rows.mapIndexed { index, row -> validatedPlate(row.registrationNumber, "rows[$index]") }
        val stored = mutableListOf<StoredTripRow>()
        writeTransaction { db ->
            db.prepareStatement(
                "INSERT INTO trip_rows (id, vehicle_id, source_name, created_at, data_json) VALUES (?, ?, ?, ?, ?)",
            ).use { statement ->
                request.rows.forEachIndexed { index, row ->
                    val vehicle = findOrCreateVehicle(db, plates[index], now)
                    val storedRow = StoredTripRow(
                        id = UUID.randomUUID().toString(),
                        vehicleId = vehicle.id,
                        sourceName = sourceName,
                        createdAt = now.toString(),
                        data = row,
                    )
                    statement.setString(1, storedRow.id)
                    statement.setString(2, storedRow.vehicleId)
                    statement.setString(3, storedRow.sourceName)
                    statement.setString(4, storedRow.createdAt)
                    statement.setString(5, json.encodeToString(row))
                    statement.addBatch()
                    stored += storedRow
                }
                statement.executeBatch()
            }
        }
        return AppendTripRowsResponse(now.toString(), stored.size, plates.distinct().size, stored)
    }

    override fun tripRowsForVehicle(vehicleId: String): List<StoredTripRow> = connection().use { db ->
        db.prepareStatement("SELECT * FROM trip_rows WHERE vehicle_id = ? ORDER BY created_at, id").use { statement ->
            statement.setString(1, vehicleId)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) add(
                        StoredTripRow(
                            id = rows.getString("id"),
                            vehicleId = rows.getString("vehicle_id"),
                            sourceName = rows.getString("source_name"),
                            createdAt = rows.getString("created_at"),
                            data = json.decodeFromString<TripRowInput>(rows.getString("data_json")),
                        ),
                    )
                }
            }
        }
    }

    override fun upsertApprovals(request: UpsertApprovalsRequest, now: Instant): UpsertApprovalsResponse {
        validateBatch(request.approvals.size)
        val sourceName = request.sourceName?.trim()?.takeIf(String::isNotEmpty)
        val plates = request.approvals.mapIndexed { index, approval ->
            validateApprovalDates(approval, index)
            validatedPlate(approval.registrationNumber, "approvals[$index]")
        }
        val stored = mutableListOf<StoredApproval>()
        writeTransaction { db ->
            request.approvals.forEachIndexed { index, approval ->
                val vehicle = findOrCreateVehicle(db, plates[index], now)
                val existing = unrevokedApproval(db, vehicle.id)
                val record = if (existing == null) {
                    StoredApproval(
                        id = UUID.randomUUID().toString(), vehicleId = vehicle.id, sourceName = sourceName,
                        createdAt = now.toString(), updatedAt = now.toString(), data = approval,
                    ).also { insertApproval(db, it) }
                } else {
                    existing.copy(sourceName = sourceName, updatedAt = now.toString(), data = approval)
                        .also { updateApproval(db, it) }
                }
                stored += record
            }
        }
        return UpsertApprovalsResponse(now.toString(), stored.size, stored)
    }

    override fun approvalForVehicle(vehicleId: String): StoredApproval? = connection().use { db ->
        db.prepareStatement(
            """SELECT * FROM vehicle_approvals WHERE vehicle_id = ?
                ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, updated_at DESC LIMIT 1""",
        ).use { statement ->
            statement.setString(1, vehicleId)
            statement.executeQuery().use { rows -> if (rows.next()) approvalFrom(rows) else null }
        }
    }

    override fun revokeApproval(registrationNumber: String, now: Instant): StoredApproval? = writeTransaction { db ->
        val plate = validatedPlate(registrationNumber)
        val vehicle = findVehicle(db, plate) ?: return@writeTransaction null
        val approval = unrevokedApproval(db, vehicle.id) ?: return@writeTransaction null
        db.prepareStatement(
            "UPDATE vehicle_approvals SET revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL",
        ).use { statement ->
            statement.setString(1, now.toString())
            statement.setString(2, now.toString())
            statement.setString(3, approval.id)
            statement.executeUpdate()
        }
        approval.copy(updatedAt = now.toString(), revokedAt = now.toString())
    }

    override fun latestSnapshot(vehicleId: String): RegistrySnapshot? = connection().use { db ->
        db.prepareStatement(
            "SELECT * FROM svv_snapshots WHERE vehicle_id = ? ORDER BY fetched_at DESC LIMIT 1",
        ).use { statement ->
            statement.setString(1, vehicleId)
            statement.executeQuery().use { rows ->
                if (!rows.next()) return@use null
                RegistrySnapshot(
                    id = rows.getString("id"),
                    vehicleId = rows.getString("vehicle_id"),
                    fetchedAt = rows.getString("fetched_at"),
                    source = rows.getString("source"),
                    registrationStatus = rows.getString("registration_status"),
                    data = json.decodeFromString<RegistryValue>(rows.getString("data_json")),
                )
            }
        }
    }

    override fun saveCheck(check: VehicleCheckResponse, newSnapshot: RegistrySnapshot?) {
        writeTransaction { db ->
            if (newSnapshot != null) {
                db.prepareStatement(
                    """INSERT INTO svv_snapshots
                        (id, vehicle_id, fetched_at, source, registration_status, data_json)
                        VALUES (?, ?, ?, ?, ?, ?)""",
                ).use { statement ->
                    statement.setString(1, newSnapshot.id)
                    statement.setString(2, newSnapshot.vehicleId)
                    statement.setString(3, newSnapshot.fetchedAt)
                    statement.setString(4, newSnapshot.source)
                    statement.setString(5, newSnapshot.registrationStatus)
                    statement.setString(6, json.encodeToString(newSnapshot.data))
                    statement.executeUpdate()
                }
            }
            db.prepareStatement(
                """INSERT INTO vehicle_checks
                    (id, vehicle_id, approval_id, snapshot_id, checked_at, data_json)
                    VALUES (?, ?, ?, ?, ?, ?)""",
            ).use { statement ->
                statement.setString(1, check.id)
                statement.setString(2, check.vehicle.id)
                statement.setString(3, check.approval?.id)
                statement.setString(4, check.registry.snapshotId)
                statement.setString(5, check.checkedAt)
                statement.setString(6, json.encodeToString(check))
                statement.executeUpdate()
            }
        }
    }

    override fun findCheck(id: String): VehicleCheckResponse? = connection().use { db ->
        db.prepareStatement("SELECT data_json FROM vehicle_checks WHERE id = ?").use { statement ->
            statement.setString(1, id)
            statement.executeQuery().use { rows ->
                if (rows.next()) json.decodeFromString<VehicleCheckResponse>(rows.getString("data_json")) else null
            }
        }
    }

    private fun findOrCreateVehicle(db: Connection, plate: String, now: Instant): Vehicle {
        findVehicle(db, plate)?.let { return it }
        val vehicle = Vehicle(UUID.randomUUID().toString(), plate, createdAt = now.toString())
        db.prepareStatement(
            "INSERT OR IGNORE INTO vehicles (id, normalized_registration_number, supplier_id, created_at) VALUES (?, ?, NULL, ?)",
        ).use { statement ->
            statement.setString(1, vehicle.id)
            statement.setString(2, vehicle.normalizedRegistrationNumber)
            statement.setString(3, vehicle.createdAt)
            statement.executeUpdate()
        }
        return findVehicle(db, plate) ?: error("Vehicle insert did not create or find $plate")
    }

    private fun findVehicle(db: Connection, plate: String): Vehicle? = db.prepareStatement(
        "SELECT * FROM vehicles WHERE normalized_registration_number = ?",
    ).use { statement ->
        statement.setString(1, plate)
        statement.executeQuery().use { rows ->
            if (!rows.next()) return@use null
            Vehicle(
                id = rows.getString("id"),
                normalizedRegistrationNumber = rows.getString("normalized_registration_number"),
                supplierId = rows.getString("supplier_id"),
                createdAt = rows.getString("created_at"),
            )
        }
    }

    private fun unrevokedApproval(db: Connection, vehicleId: String): StoredApproval? = db.prepareStatement(
        "SELECT * FROM vehicle_approvals WHERE vehicle_id = ? AND revoked_at IS NULL LIMIT 1",
    ).use { statement ->
        statement.setString(1, vehicleId)
        statement.executeQuery().use { rows -> if (rows.next()) approvalFrom(rows) else null }
    }

    private fun approvalFrom(rows: java.sql.ResultSet) = StoredApproval(
        id = rows.getString("id"),
        vehicleId = rows.getString("vehicle_id"),
        sourceName = rows.getString("source_name"),
        createdAt = rows.getString("created_at"),
        updatedAt = rows.getString("updated_at"),
        revokedAt = rows.getString("revoked_at"),
        data = json.decodeFromString<ApprovalInput>(rows.getString("data_json")),
    )

    private fun insertApproval(db: Connection, approval: StoredApproval) {
        db.prepareStatement(
            """INSERT INTO vehicle_approvals
                (id, vehicle_id, source_name, start_date, expiry_date, created_at, updated_at, revoked_at, data_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)""",
        ).use { statement ->
            statement.setString(1, approval.id)
            statement.setString(2, approval.vehicleId)
            statement.setString(3, approval.sourceName)
            statement.setString(4, approval.data.startDate)
            statement.setString(5, approval.data.expiryDate)
            statement.setString(6, approval.createdAt)
            statement.setString(7, approval.updatedAt)
            statement.setString(8, json.encodeToString(approval.data))
            statement.executeUpdate()
        }
    }

    private fun updateApproval(db: Connection, approval: StoredApproval) {
        db.prepareStatement(
            """UPDATE vehicle_approvals SET source_name = ?, start_date = ?, expiry_date = ?,
                updated_at = ?, data_json = ? WHERE id = ? AND revoked_at IS NULL""",
        ).use { statement ->
            statement.setString(1, approval.sourceName)
            statement.setString(2, approval.data.startDate)
            statement.setString(3, approval.data.expiryDate)
            statement.setString(4, approval.updatedAt)
            statement.setString(5, json.encodeToString(approval.data))
            statement.setString(6, approval.id)
            statement.executeUpdate()
        }
    }

    private fun validateBatch(size: Int) {
        require(size > 0) { "rows must not be empty" }
        require(size <= 10_000) { "requests are limited to 10000 rows" }
    }

    private fun validateApprovalDates(approval: ApprovalInput, index: Int) {
        val dates = listOf("startDate" to approval.startDate, "expiryDate" to approval.expiryDate)
        dates.forEach { (field, value) ->
            if (value != null) try {
                LocalDate.parse(value)
            } catch (_: DateTimeParseException) {
                throw IllegalArgumentException("approvals[$index].$field must be an ISO date (yyyy-MM-dd)")
            }
        }
        if (approval.startDate != null && approval.expiryDate != null) {
            require(!LocalDate.parse(approval.expiryDate).isBefore(LocalDate.parse(approval.startDate))) {
                "approvals[$index].expiryDate must not be before startDate"
            }
        }
    }

    private fun validatedPlate(value: String, field: String = "registrationNumber"): String =
        normalizeRegistrationNumber(value).also { plate ->
            require(plate.matches(Regex("[A-Z0-9]{2,7}"))) {
                "$field must be a 2-7 character Norwegian registration number"
            }
        }
}
