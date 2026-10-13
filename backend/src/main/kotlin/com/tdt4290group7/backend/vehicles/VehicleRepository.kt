package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.math.BigInteger
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatterBuilder
import java.util.UUID
import org.sqlite.SQLiteErrorCode
import org.sqlite.SQLiteException

internal class VehicleStorageBusyException(cause: SQLiteException) :
    RuntimeException("Vehicle database is busy", cause)

interface VehicleStore {
    fun findOrCreateVehicle(registrationNumber: String, now: Instant): Vehicle
    fun appendTripRows(request: AppendTripRowsRequest, now: Instant): AppendTripRowsResponse
    fun tripRowsForVehicle(registrationNumber: String): List<StoredTripRow>
    fun upsertApprovals(request: UpsertApprovalsRequest, now: Instant): UpsertApprovalsResponse
    fun approvalForVehicle(registrationNumber: String): StoredApproval?
    fun revokeApproval(registrationNumber: String, now: Instant): StoredApproval?
    fun latestSnapshot(registrationNumber: String): RegistrySnapshot?
    fun saveCheck(check: VehicleCheckResponse, newSnapshot: RegistrySnapshot?)
    fun findCheck(id: String): VehicleCheckResponse?
    fun listVehicles(search: String, status: ApprovalStatus?, page: Int, pageSize: Int, today: LocalDate): VehicleListResponse
    fun vehicleDetails(registrationNumber: String, today: LocalDate): VehicleDetailsResponse?
    fun checkHistory(registrationNumber: String, page: Int, pageSize: Int): VehicleHistoryResponse?
}

private val timestampFormat = DateTimeFormatterBuilder().appendInstant(9).toFormatter()
internal fun Instant.storageTimestamp(): String = timestampFormat.format(this)

class VehicleRepository(databasePath: Path) : VehicleStore {
    private val databaseUrl: String

    init {
        val path = databasePath.toAbsolutePath().normalize()
        Files.createDirectories(path.parent)
        databaseUrl = "jdbc:sqlite:$path"
        writeTransaction { db ->
            // Never silently delete or partially reinterpret an old database.
            val legacy = query(db, "SELECT name FROM pragma_table_info('vehicles') WHERE name = 'id'") {
                it.getString("name")
            }.isNotEmpty()
            check(!legacy) { "Legacy vehicle schema detected. Choose a new VEHICLE_DB_PATH or arrange a reviewed migration; no data has been reset." }
            val version = query(db, "PRAGMA user_version") { it.getInt(1) }.single()
            check(version == 0 || version == 3) {
                "Vehicle schema version $version is not supported. Choose a new VEHICLE_DB_PATH or arrange a reviewed migration; no data has been reset."
            }
            if (version == 0) check(query(db, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'") {
                it.getString(1)
            }.isEmpty()) { "Unversioned database is not empty; no automatic reinterpretation is allowed" }
            db.createStatement().use { statement ->
                vehicleSchemaStatements.forEach { statement.executeUpdate(it) }
                statement.execute("PRAGMA user_version = 3")
            }
        }
    }

    private fun connection(): Connection = DriverManager.getConnection(databaseUrl).also { db ->
        db.createStatement().use {
            it.execute("PRAGMA foreign_keys = ON")
            it.execute("PRAGMA busy_timeout = 5000")
        }
    }

    /** One SQLite read snapshot keeps totals, approvals and historical summaries consistent. */
    private fun <T> readTransaction(action: (Connection) -> T): T = connection().use { db ->
        db.autoCommit = false
        try { action(db) } finally { db.rollback() }
    }

    override fun listVehicles(search: String, status: ApprovalStatus?, page: Int, pageSize: Int, today: LocalDate): VehicleListResponse {
        validatePage(page, pageSize)
        val plateSearch = normalizeRegistrationNumber(search)
        require(plateSearch.matches(Regex("[A-Z0-9]{0,7}"))) { "search must contain up to 7 registration-number characters" }
        return readTransaction { db ->
            // Select the same approval the check endpoint uses, then evaluate dates without writing.
            val approvalJoin = """LEFT JOIN vehicle_approvals a ON a.id = (
                SELECT id FROM vehicle_approvals WHERE registration_number = v.registration_number
                ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, updated_at DESC, rowid DESC LIMIT 1)"""
            val statusSql = """CASE WHEN a.id IS NULL THEN 'NOT_APPROVED' WHEN a.revoked_at IS NOT NULL THEN 'REVOKED'
                WHEN a.start_date > ? THEN 'NOT_YET_ACTIVE' WHEN a.expiry_date < ? THEN 'EXPIRED' ELSE 'ACTIVE' END"""
            val where = "v.registration_number LIKE ?" + if (status == null) "" else " AND ($statusSql) = ?"
            val parameters: List<Any?> = listOf("%$plateSearch%") +
                if (status == null) emptyList() else listOf(today.toString(), today.toString(), status.name)
            val total = query(db, "SELECT count(*) FROM vehicles v $approvalJoin WHERE $where", parameters) { it.getInt(1) }.single()
            val items = query(db, """SELECT v.* FROM vehicles v $approvalJoin WHERE $where
                ORDER BY v.registration_number LIMIT ? OFFSET ?""", parameters + listOf(pageSize, (page.toLong() - 1) * pageSize)) { row ->
                val vehicle = vehicleFrom(row)
                val approval = currentApproval(db, vehicle.registrationNumber)
                VehicleOverview(vehicle, approvalStatus(approval, today), approval, checkSummaries(db, vehicle.registrationNumber, 1, 0).firstOrNull())
            }
            VehicleListResponse(items, total, page, pageSize, today.toString())
        }
    }

    override fun vehicleDetails(registrationNumber: String, today: LocalDate): VehicleDetailsResponse? = readTransaction { db ->
        val plate = validatedPlate(registrationNumber)
        val vehicle = query(db, "SELECT * FROM vehicles WHERE registration_number = ?", listOf(plate), ::vehicleFrom).firstOrNull()
            ?: return@readTransaction null
        val approval = currentApproval(db, plate)
        VehicleDetailsResponse(vehicle, approvalStatus(approval, today), today.toString(), approval,
            query(db, "SELECT * FROM trip_rows WHERE registration_number = ? ORDER BY created_at DESC, id DESC", listOf(plate), ::tripFrom),
            query(db, "SELECT * FROM svv_snapshots WHERE registration_number = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1", listOf(plate)) { snapshotFrom(db, it) }.firstOrNull(),
            checkSummaries(db, plate, 1, 0).firstOrNull())
    }

    override fun checkHistory(registrationNumber: String, page: Int, pageSize: Int): VehicleHistoryResponse? {
        validatePage(page, pageSize)
        return readTransaction { db ->
            val plate = validatedPlate(registrationNumber)
            if (query(db, "SELECT 1 FROM vehicles WHERE registration_number = ?", listOf(plate)) { it.getInt(1) }.isEmpty()) return@readTransaction null
            val total = query(db, "SELECT count(*) FROM vehicle_checks WHERE registration_number = ?", listOf(plate)) { it.getInt(1) }.single()
            VehicleHistoryResponse(checkSummaries(db, plate, pageSize, (page.toLong() - 1) * pageSize), total, page, pageSize)
        }
    }

    private fun vehicleFrom(row: ResultSet) = Vehicle(row.getString("registration_number"), row.getString("supplier_id"), row.getString("created_at"))

    private fun currentApproval(db: Connection, plate: String): StoredApproval? =
        query(db, """SELECT * FROM vehicle_approvals WHERE registration_number = ?
            ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, updated_at DESC, rowid DESC LIMIT 1""", listOf(plate)) { approvalFrom(it) }.firstOrNull()

    private fun checkSummaries(db: Connection, plate: String, limit: Int, offset: Long): List<VehicleCheckSummary> =
        query(db, """SELECT c.*, s.fetched_at FROM vehicle_checks c LEFT JOIN svv_snapshots s ON s.id = c.snapshot_id
            WHERE c.registration_number = ? ORDER BY c.checked_at DESC, c.rowid DESC LIMIT ? OFFSET ?""", listOf(plate, limit, offset)) { row ->
            val id = row.getString("id")
            VehicleCheckSummary(id, row.getString("checked_at"), ApprovalStatus.valueOf(row.getString("approval_status")),
                RegistryDataSource.valueOf(row.getString("registry_data_source")), LookupOutcome.valueOf(row.getString("lookup_outcome")),
                row.getString("fetched_at"), row.getString("refresh_failure")?.let(LookupOutcome::valueOf),
                query(db, "SELECT deviation_code FROM vehicle_check_deviations WHERE check_id = ? ORDER BY ordinal", listOf(id)) {
                    VehicleDeviation.valueOf(it.getString(1))
                })
        }

    private fun validatePage(page: Int, pageSize: Int) {
        require(page > 0) { "page must be a positive integer" }
        require(pageSize in 1..100) { "pageSize must be between 1 and 100" }
    }

    /** Reserve the writer before reading; preserve atomic batches and cross-process contention handling. */
    private fun <T> writeTransaction(action: (Connection) -> T): T = try {
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

    override fun findOrCreateVehicle(registrationNumber: String, now: Instant): Vehicle =
        writeTransaction { findOrCreateVehicle(it, validatedPlate(registrationNumber), now) }

    override fun appendTripRows(request: AppendTripRowsRequest, now: Instant): AppendTripRowsResponse {
        validateBatch(request.rows.size)
        val inputs = request.rows.mapIndexed { index, input ->
            validateTrip(input, index)
            input.copy(registrationNumber = validatedPlate(input.registrationNumber, "rows[$index].registrationNumber"))
        }
        val source = request.sourceName?.trim()?.takeIf(String::isNotEmpty)
        val records = writeTransaction { db ->
            inputs.map { input ->
                findOrCreateVehicle(db, input.registrationNumber, now)
                val record = StoredTripRow(
                    UUID.randomUUID().toString(), input.registrationNumber, source, now.storageTimestamp(), input,
                )
                val values = linkedMapOf<String, Any?>(
                    "id" to record.id, "registration_number" to record.registrationNumber,
                    "source_name" to source, "created_at" to record.createdAt,
                    "period_start" to input.periodStart, "period_end" to input.periodEnd,
                    "fuel_technology" to input.fuelTechnology.code, "make" to input.make,
                    "body_type" to input.bodyType.name, "vehicle_category" to input.vehicleCategory.name,
                    "model" to input.model, "co2_registered" to input.co2Registered.asInteger(),
                    "trip_count" to input.tripCount, "assignment_number" to input.assignmentNumber,
                    "comment" to input.comment,
                )
                tripDecimalColumns.forEach { values.putDecimal(it.name, it.value(input)) }
                insert(db, "trip_rows", values)
                record
            }
        }
        return AppendTripRowsResponse(now.storageTimestamp(), records.size, inputs.map { it.registrationNumber }.distinct().size, records)
    }

    override fun tripRowsForVehicle(registrationNumber: String): List<StoredTripRow> = connection().use { db ->
        query(db, "SELECT * FROM trip_rows WHERE registration_number = ? ORDER BY created_at, id",
            listOf(validatedPlate(registrationNumber)), ::tripFrom)
    }

    override fun upsertApprovals(request: UpsertApprovalsRequest, now: Instant): UpsertApprovalsResponse {
        validateBatch(request.approvals.size)
        val inputs = request.approvals.mapIndexed { index, input ->
            validateApprovalDates(input, index)
            input.copy(registrationNumber = validatedPlate(input.registrationNumber, "approvals[$index].registrationNumber"))
        }
        val source = request.sourceName?.trim()?.takeIf(String::isNotEmpty)
        val records = writeTransaction { db ->
            inputs.map { input ->
                findOrCreateVehicle(db, input.registrationNumber, now)
                val existing = unrevokedApproval(db, input.registrationNumber)
                val record = existing?.copy(sourceName = source, updatedAt = now.storageTimestamp(), data = input)
                    ?: StoredApproval(UUID.randomUUID().toString(), input.registrationNumber, source,
                        now.storageTimestamp(), now.storageTimestamp(), data = input)
                val values = approvalValues(record)
                if (existing == null) insert(db, "vehicle_approvals", values)
                else {
                    values.remove("id")
                    values.remove("registration_number")
                    values.remove("created_at")
                    update(db, "vehicle_approvals", values, "id = ? AND revoked_at IS NULL", listOf(record.id))
                }
                record
            }
        }
        return UpsertApprovalsResponse(now.storageTimestamp(), records.size, records)
    }

    override fun approvalForVehicle(registrationNumber: String): StoredApproval? = connection().use { db ->
        query(db, """SELECT * FROM vehicle_approvals WHERE registration_number = ?
            ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, updated_at DESC, rowid DESC LIMIT 1""",
            listOf(validatedPlate(registrationNumber))) { approvalFrom(it) }.firstOrNull()
    }

    override fun revokeApproval(registrationNumber: String, now: Instant): StoredApproval? = writeTransaction { db ->
        val record = unrevokedApproval(db, validatedPlate(registrationNumber)) ?: return@writeTransaction null
        update(db, "vehicle_approvals",
            linkedMapOf("revoked_at" to now.storageTimestamp(), "updated_at" to now.storageTimestamp()),
            "id = ? AND revoked_at IS NULL", listOf(record.id))
        record.copy(updatedAt = now.storageTimestamp(), revokedAt = now.storageTimestamp())
    }

    override fun latestSnapshot(registrationNumber: String): RegistrySnapshot? = connection().use { db ->
        query(db, "SELECT * FROM svv_snapshots WHERE registration_number = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1",
            listOf(validatedPlate(registrationNumber))) { snapshotFrom(db, it) }.firstOrNull()
    }

    override fun saveCheck(check: VehicleCheckResponse, newSnapshot: RegistrySnapshot?) {
        writeTransaction { db ->
            if (newSnapshot != null) insertSnapshot(db, newSnapshot)
            val values = linkedMapOf<String, Any?>(
                "id" to check.id, "registration_number" to check.vehicle.registrationNumber,
                "checked_at" to check.checkedAt, "vehicle_supplier_id" to check.vehicle.supplierId,
                "vehicle_created_at" to check.vehicle.createdAt, "approval_id" to check.approval?.id,
                "snapshot_id" to check.registry.snapshotId, "approval_status" to check.approvalStatus.name,
                "registry_data_source" to check.registry.dataSource.name,
                "lookup_outcome" to check.registry.lookupOutcome.name,
                "refresh_failure" to check.registry.refreshFailure?.name,
                "usage_prohibition_state" to check.registry.usageProhibitionState.name,
            )
            check.approval?.let { record ->
                require(record.registrationNumber == check.vehicle.registrationNumber) { "Approval vehicle mismatch" }
                approvalValues(record).filterKeys { it != "id" && it != "registration_number" }
                    .forEach { (key, value) -> values["approval_$key"] = value }
            }
            insert(db, "vehicle_checks", values)
            check.tripRows.forEachIndexed { index, row ->
                insert(db, "vehicle_check_trip_rows", linkedMapOf(
                    "check_id" to check.id, "trip_row_id" to row.id,
                    "registration_number" to check.vehicle.registrationNumber, "ordinal" to index,
                ))
            }
            check.deviations.forEachIndexed { index, deviation ->
                insert(db, "vehicle_check_deviations", linkedMapOf(
                    "check_id" to check.id, "deviation_code" to deviation.name,
                    "origin" to if (deviation in check.registry.deviations) "REGISTRY" else "APPROVAL",
                    "ordinal" to index,
                ))
            }
        }
    }

    override fun findCheck(id: String): VehicleCheckResponse? = connection().use { db ->
        query(db, "SELECT * FROM vehicle_checks WHERE id = ?", listOf(id)) { row ->
            val plate = row.getString("registration_number")
            val snapshot = row.getString("snapshot_id")?.let { snapshotId ->
                query(db, "SELECT * FROM svv_snapshots WHERE id = ?", listOf(snapshotId)) { snapshotFrom(db, it) }.single()
            }
            val findings = query(db, "SELECT * FROM vehicle_check_deviations WHERE check_id = ? ORDER BY ordinal", listOf(id)) {
                VehicleDeviation.valueOf(it.getString("deviation_code")) to it.getString("origin")
            }
            val statistics = query(db, """SELECT t.* FROM trip_rows t JOIN vehicle_check_trip_rows c ON c.trip_row_id = t.id
                WHERE c.check_id = ? ORDER BY c.ordinal""", listOf(id), ::tripFrom)
            VehicleCheckResponse(
                id, row.getString("checked_at"),
                Vehicle(plate, row.getString("vehicle_supplier_id"), row.getString("vehicle_created_at")),
                ApprovalStatus.valueOf(row.getString("approval_status")),
                row.getString("approval_id")?.let { approvalFrom(row, "approval_", plate) },
                statistics,
                RegistryCheckResult(
                    dataSource = RegistryDataSource.valueOf(row.getString("registry_data_source")),
                    lookupOutcome = LookupOutcome.valueOf(row.getString("lookup_outcome")),
                    fetchedAt = snapshot?.fetchedAt, registrationStatus = snapshot?.data?.registrationStatus,
                    data = snapshot?.data,
                    usageProhibitionState = UsageProhibitionState.valueOf(row.getString("usage_prohibition_state")),
                    deviations = findings.filter { it.second == "REGISTRY" }.map { it.first },
                    snapshotId = snapshot?.id,
                    refreshFailure = row.getString("refresh_failure")?.let(LookupOutcome::valueOf),
                ),
                findings.map { it.first },
            )
        }.firstOrNull()
    }

    private fun insertSnapshot(db: Connection, snapshot: RegistrySnapshot) {
        require(snapshot.registrationNumber == snapshot.data.registrationNumber) { "Snapshot vehicle mismatch" }
        val data = snapshot.data
        val values = linkedMapOf<String, Any?>(
            "id" to snapshot.id, "registration_number" to snapshot.registrationNumber,
            "fetched_at" to snapshot.fetchedAt, "source" to snapshot.source,
            "registration_status" to data.registrationStatus, "make" to data.make, "model" to data.model,
        )
        values.putCode("vehicle_category", data.vehicleCategory)
        values.putCode("body_type", data.bodyType)
        values.putCode("euro_class", data.euroClass)
        insert(db, "svv_snapshots", values)
        data.fuels.forEachIndexed { fuelIndex, fuel ->
            val fuelValues = linkedMapOf<String, Any?>("snapshot_id" to snapshot.id, "fuel_index" to fuelIndex)
            fuelValues.putCode("fuel_technology", fuel.fuelTechnology)
            insert(db, "svv_snapshot_fuels", fuelValues)
            fuel.measurements.forEachIndexed { measurementIndex, measurement ->
                val measurementValues = linkedMapOf<String, Any?>(
                    "snapshot_id" to snapshot.id, "fuel_index" to fuelIndex, "measurement_index" to measurementIndex,
                )
                measurementValues.putCode("measurement_method", measurement.measurementMethod)
                measurementValues.putDecimal("co2_grams_per_km", measurement.co2GramsPerKm)
                measurementValues.putDecimal("nox_mg_per_km", measurement.noxMgPerKm)
                insert(db, "svv_emission_measurements", measurementValues)
            }
        }
    }

    private fun snapshotFrom(db: Connection, row: ResultSet): RegistrySnapshot {
        val id = row.getString("id")
        val plate = row.getString("registration_number")
        val fuels = query(db, "SELECT * FROM svv_snapshot_fuels WHERE snapshot_id = ? ORDER BY fuel_index", listOf(id)) { fuel ->
            val measurements = query(db, """SELECT * FROM svv_emission_measurements
                WHERE snapshot_id = ? AND fuel_index = ? ORDER BY measurement_index""",
                listOf(id, fuel.getInt("fuel_index"))) {
                RegistryEmissionMeasurement(it.code("measurement_method"), it.decimal("co2_grams_per_km"), it.decimal("nox_mg_per_km"))
            }
            RegistryFuel(fuel.code("fuel_technology"), measurements)
        }
        return RegistrySnapshot(id, plate, row.getString("fetched_at"), row.getString("source"),
            RegistryVehicleData(plate, row.getString("registration_status"), row.getString("make"), row.getString("model"),
                row.code("vehicle_category"), row.code("body_type"), row.code("euro_class"), fuels))
    }

    private fun tripFrom(row: ResultSet): StoredTripRow {
        val plate = row.getString("registration_number")
        return StoredTripRow(row.getString("id"), plate, row.getString("source_name"), row.getString("created_at"),
            TripRowInput(
                registrationNumber = plate, periodStart = row.getString("period_start"), periodEnd = row.getString("period_end"),
                fuelTechnology = FuelTechnology.fromCode(row.getString("fuel_technology")), make = row.getString("make"),
                bodyType = BodyType.valueOf(row.getString("body_type")),
                vehicleCategory = VehicleCategory.valueOf(row.getString("vehicle_category")), model = row.getString("model"),
                co2Registered = row.boolean("co2_registered")!!, co2GramsPerKm = row.decimal("co2_grams_per_km")!!,
                medianCo2 = row.decimal("median_co2")!!, totalTripKm = row.decimal("total_trip_km")!!,
                totalKmCo2Registered = row.decimal("total_km_co2_registered")!!,
                totalKmCo2NotRegistered = row.decimal("total_km_co2_not_registered")!!,
                kmFuelNotRegistered = row.decimal("km_fuel_not_registered")!!,
                totalKmFuelRegistered = row.decimal("total_km_fuel_registered")!!,
                totalKmNoxRegistered = row.decimal("total_km_nox_registered")!!,
                totalNoxRegisteredGrams = row.decimal("total_nox_registered_grams")!!,
                tripCount = row.getInt("trip_count"),
                assignmentNumber = row.getString("assignment_number"),
                averageConsumptionLitresPerKm = row.decimal("average_consumption_litres_per_km"),
                fuelConsumedLitres = row.decimal("fuel_consumed_litres"), comment = row.getString("comment"),
            ))
    }

    private fun approvalFrom(row: ResultSet, prefix: String = "", registrationNumber: String? = null): StoredApproval {
        val plate = registrationNumber ?: row.getString("registration_number")
        return StoredApproval(
            row.getString(prefix + "id"), plate, row.getString(prefix + "source_name"),
            row.getString(prefix + "created_at"), row.getString(prefix + "updated_at"), row.getString(prefix + "revoked_at"),
            ApprovalInput(plate, FuelTechnology.fromCode(row.getString(prefix + "fuel_technology")),
                VehicleCategory.valueOf(row.getString(prefix + "vehicle_category")), row.boolean(prefix + "used_throughout_period"),
                row.getString(prefix + "start_date"), row.getString(prefix + "expiry_date")),
        )
    }

    private fun approvalValues(record: StoredApproval) = linkedMapOf<String, Any?>(
        "id" to record.id, "registration_number" to record.registrationNumber, "source_name" to record.sourceName,
        "created_at" to record.createdAt, "updated_at" to record.updatedAt, "revoked_at" to record.revokedAt,
        "fuel_technology" to record.data.fuelTechnology.code, "used_throughout_period" to record.data.usedThroughoutPeriod?.asInteger(),
        "start_date" to record.data.startDate, "expiry_date" to record.data.expiryDate,
        "vehicle_category" to record.data.vehicleCategory.name,
    )

    private fun unrevokedApproval(db: Connection, plate: String): StoredApproval? =
        query(db, "SELECT * FROM vehicle_approvals WHERE registration_number = ? AND revoked_at IS NULL", listOf(plate)) {
            approvalFrom(it)
        }.firstOrNull()

    private fun findOrCreateVehicle(db: Connection, plate: String, now: Instant): Vehicle {
        db.prepareStatement("INSERT OR IGNORE INTO vehicles (registration_number, created_at) VALUES (?, ?)").use {
            it.setString(1, plate)
            it.setString(2, now.storageTimestamp())
            it.executeUpdate()
        }
        return query(db, "SELECT * FROM vehicles WHERE registration_number = ?", listOf(plate)) {
            Vehicle(it.getString("registration_number"), it.getString("supplier_id"), it.getString("created_at"))
        }.single()
    }

    private fun validateTrip(input: TripRowInput, index: Int) {
        validateTrailerFuel(input.vehicleCategory, input.fuelTechnology, "rows[$index]")
        val start = validatedDate(input.periodStart, "rows[$index].periodStart")
        val end = validatedDate(input.periodEnd, "rows[$index].periodEnd")
        require(!end.isBefore(start)) { "rows[$index].periodEnd must not be before periodStart" }
        require(input.make.isNotBlank() && input.model.isNotBlank()) { "rows[$index].make and model must not be blank" }
        require(input.tripCount >= 0) { "rows[$index].tripCount must be non-negative" }
        if (input.fuelTechnology.usesLitres) {
            require(input.averageConsumptionLitresPerKm != null && input.fuelConsumedLitres != null) {
                "rows[$index] must provide both litres fields for this fuel technology"
            }
        } else {
            require(input.averageConsumptionLitresPerKm == null && input.fuelConsumedLitres == null) {
                "rows[$index] must omit litres fields or set them to null for electric/hydrogen vehicles and unpowered trailers"
            }
        }
        tripDecimalColumns.forEach { column ->
            column.value(input)?.let {
                try { decimalParts(it) } catch (_: IllegalArgumentException) {
                    throw IllegalArgumentException("rows[$index].${column.name} must be non-negative and fit the supported decimal range")
                }
            }
        }
    }

    private fun validateApprovalDates(input: ApprovalInput, index: Int) {
        validateTrailerFuel(input.vehicleCategory, input.fuelTechnology, "approvals[$index]")
        val start = input.startDate?.let { validatedDate(it, "approvals[$index].startDate") }
        val end = input.expiryDate?.let { validatedDate(it, "approvals[$index].expiryDate") }
        require(start == null || end == null || !end.isBefore(start)) { "approvals[$index].expiryDate must not be before startDate" }
    }

    private fun validateTrailerFuel(category: VehicleCategory, fuel: FuelTechnology, field: String) {
        require(category.isTrailer == (fuel == FuelTechnology.NOT_APPLICABLE)) {
            "$field must use NOT_APPLICABLE fuel exactly when the vehicle category is O1, O2, O3 or O4"
        }
    }

    private fun validatedDate(value: String, field: String): LocalDate {
        require(value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) { "$field must be a date (YYYY-MM-DD)" }
        return try { LocalDate.parse(value) } catch (_: java.time.format.DateTimeParseException) {
            throw IllegalArgumentException("$field must be a valid date (YYYY-MM-DD)")
        }
    }

    private fun validateBatch(size: Int) {
        require(size in 1..10_000) { "requests must contain between 1 and 10000 rows" }
    }

    private fun validatedPlate(value: String, field: String = "registrationNumber"): String =
        normalizeRegistrationNumber(value).also {
            require(it.matches(Regex("[A-Z]{2}[1-9][0-9]{3,4}"))) {
                "$field must contain two letters followed by four or five digits, without a leading zero"
            }
        }

    private fun Boolean.asInteger(): Int = if (this) 1 else 0
    private fun ResultSet.boolean(column: String): Boolean? = getObject(column)?.let { getInt(column) == 1 }
    private fun ResultSet.code(column: String): RegistryCode? = getString(column)?.let { RegistryCode(it, getString(column + "_name")) }
    private fun ResultSet.decimal(column: String): BigDecimal? = getObject(column + "_unscaled")?.let {
        BigDecimal(BigInteger.valueOf(getLong(column + "_unscaled")), getInt(column + "_scale"))
    }

    private fun MutableMap<String, Any?>.putCode(column: String, code: RegistryCode?) {
        this[column] = code?.code
        this[column + "_name"] = code?.name
    }

    private fun MutableMap<String, Any?>.putDecimal(column: String, value: BigDecimal?) {
        val parts = value?.let(::decimalParts)
        this[column + "_unscaled"] = parts?.unscaled
        this[column + "_scale"] = parts?.scale
    }

    /** Table/column names below come only from this repository's explicit allowlists. Values are bound. */
    private fun insert(db: Connection, table: String, values: Map<String, Any?>) {
        val columns = values.keys.joinToString(",")
        val placeholders = values.keys.joinToString(",") { "?" }
        db.prepareStatement("INSERT INTO $table ($columns) VALUES ($placeholders)").use {
            values.values.forEachIndexed { index, value -> it.setObject(index + 1, value) }
            it.executeUpdate()
        }
    }

    private fun update(db: Connection, table: String, values: Map<String, Any?>, where: String, parameters: List<Any?>) {
        val assignments = values.keys.joinToString(",") { "$it = ?" }
        db.prepareStatement("UPDATE $table SET $assignments WHERE $where").use {
            (values.values + parameters).forEachIndexed { index, value -> it.setObject(index + 1, value) }
            it.executeUpdate()
        }
    }

    private fun <T> query(db: Connection, sql: String, parameters: List<Any?> = emptyList(), map: (ResultSet) -> T): List<T> =
        db.prepareStatement(sql).use { statement ->
            parameters.forEachIndexed { index, value -> statement.setObject(index + 1, value) }
            statement.executeQuery().use { rows -> buildList { while (rows.next()) add(map(rows)) } }
        }
}
