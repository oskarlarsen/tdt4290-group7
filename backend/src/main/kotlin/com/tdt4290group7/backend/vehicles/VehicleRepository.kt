package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.math.BigInteger
import java.nio.file.Path
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatterBuilder
import java.util.UUID
import com.tdt4290group7.backend.onboarding.OnboardingRepository

interface VehicleStore {
    fun findOrCreateVehicle(registrationNumber: String, now: Instant): Vehicle
    fun appendTripRows(request: AppendTripRowsRequest, now: Instant): AppendTripRowsResponse
    fun tripRowsForVehicle(registrationNumber: String): List<StoredTripRow>
    fun listTripRows(search: String, page: Int, pageSize: Int): TripRowsListResponse
    fun latestSnapshot(registrationNumber: String): RegistrySnapshot?
    fun saveCheck(check: VehicleCheckResponse, newSnapshot: RegistrySnapshot?)
    fun findCheck(id: String): VehicleCheckResponse?
    fun vehicleDetails(registrationNumber: String, agreementId: String? = null): VehicleDetailsResponse?
    fun checkHistory(registrationNumber: String, page: Int, pageSize: Int): VehicleHistoryResponse?
    /** True when an admin approved this unlisted vehicle as a one-off exception. */
    fun exceptionApproved(registrationNumber: String, agreementId: String? = null): Boolean = false
}
private val timestampFormat = DateTimeFormatterBuilder().appendInstant(9).toFormatter()
internal fun Instant.storageTimestamp(): String = timestampFormat.format(this)

class VehicleRepository(databasePath: Path) : VehicleStore {
    internal val database = VehicleDatabase(databasePath)
    val fleet = FleetRepository(database)
    internal val onboarding = OnboardingRepository(database, fleet)
    private fun <T> readTransaction(action: (Connection) -> T) = database.read(action)
    private fun <T> writeTransaction(action: (Connection) -> T) = database.write(action)
    private fun <T> query(db: Connection, sql: String, parameters: List<Any?> = emptyList(), map: (ResultSet) -> T) = database.query(db, sql, parameters, map)
    private fun insert(db: Connection, table: String, values: Map<String, Any?>) = database.insert(db, table, values)

    override fun listTripRows(search: String, page: Int, pageSize: Int): TripRowsListResponse {
        validatePage(page, pageSize)
        val plateSearch = normalizeRegistrationNumber(search)
        require(plateSearch.matches(Regex("[A-Z0-9]{0,7}"))) { "search must contain up to 7 registration-number characters" }
        return readTransaction { db ->
            val parameters = listOf("%$plateSearch%")
            val total = query(db, "SELECT count(*) FROM trip_rows WHERE registration_number LIKE ?", parameters) { it.getInt(1) }.single()
            val items = query(db, """SELECT * FROM trip_rows WHERE registration_number LIKE ?
                ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?""",
                parameters + listOf(pageSize, (page.toLong() - 1) * pageSize), ::tripFrom)
            TripRowsListResponse(items, total, page, pageSize)
        }
    }

    /** True when the listing the check judges the truck by (the given agreement, or the best fit) carries an admin-approved exception. */
    override fun exceptionApproved(registrationNumber: String, agreementId: String?) = readTransaction { db ->
        fleet.usage(db, registrationNumber, agreementId)?.get("exception_approved") == 1
    }

    /**
     * A truck can be listed under several agreements. [agreementId] picks the one to judge it by; without it the best fit is used
     * (see [FleetRepository.usage]). The vehicle, agreement and latest check in the answer all belong to that one listing.
     */
    override fun vehicleDetails(registrationNumber: String, agreementId: String?): VehicleDetailsResponse? = readTransaction { db ->
        val plate = validatedPlate(registrationNumber)
        val truck = query(db, "SELECT * FROM vehicles WHERE registration_number = ?", listOf(plate), ::vehicleFrom).firstOrNull() ?: return@readTransaction null
        val usage = fleet.usage(db, plate, agreementId)
        if (agreementId != null && usage == null) return@readTransaction null
        val vehicle = usage?.let { Vehicle(plate, it["created_at"] as String, it["agreement_id"] as String, it["planned"] == 1, it["listed"] == 1, it["updated_at"] as String) } ?: truck
        // The latest check for this agreement; a truck with one listing also falls back to its checks from before agreements were tracked per check.
        val chosen = usage?.get("agreement_id") as String?
        val latest = checkSummaries(db, plate, if (agreementId != null) chosen else null, 1, 0).firstOrNull()
            ?: if (agreementId != null && fleet.usageCount(db, plate) == 1) checkSummaries(db, plate, null, 1, 0).firstOrNull() else null
        VehicleDetailsResponse(vehicle, fleet.evidence(db, plate, agreementId),
            query(db, "SELECT * FROM trip_rows WHERE registration_number = ? ORDER BY period_start DESC, created_at DESC", listOf(plate), ::tripFrom),
            query(db, "SELECT * FROM svv_snapshots WHERE registration_number = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1", listOf(plate)) { snapshotFrom(db, it) }.firstOrNull(),
            latest)
    }

    override fun checkHistory(registrationNumber: String, page: Int, pageSize: Int): VehicleHistoryResponse? {
        validatePage(page, pageSize)
        return readTransaction { db ->
            val plate = validatedPlate(registrationNumber)
            if (query(db, "SELECT 1 FROM vehicles WHERE registration_number = ?", listOf(plate)) { it.getInt(1) }.isEmpty()) return@readTransaction null
            val total = query(db, "SELECT count(*) FROM vehicle_checks WHERE registration_number = ?", listOf(plate)) { it.getInt(1) }.single()
            VehicleHistoryResponse(checkSummaries(db, plate, null, pageSize, (page.toLong() - 1) * pageSize), total, page, pageSize)
        }
    }

    /** The truck row. Which agreements it is listed under is in vehicle_usages; the old columns on this row are frozen. */
    private fun vehicleFrom(row: ResultSet) = Vehicle(row.getString("registration_number"), row.getString("created_at"),
        null, row.getInt("planned") == 1, false, row.getString("updated_at"))

    private fun checkSummaries(db: Connection, plate: String, agreementId: String?, limit: Int, offset: Long): List<VehicleCheckSummary> =
        query(db, """SELECT c.*, s.fetched_at FROM vehicle_checks c LEFT JOIN svv_snapshots s ON s.id = c.snapshot_id
            WHERE c.registration_number = ?${if (agreementId != null) " AND c.agreement_id = ?" else ""}
            ORDER BY c.checked_at DESC, c.rowid DESC LIMIT ? OFFSET ?""", listOfNotNull(plate, agreementId) + listOf(limit, offset)) { row ->
            val id = row.getString("id")
            VehicleCheckSummary(id, row.getString("checked_at"), RegistryDataSource.valueOf(row.getString("registry_data_source")), LookupOutcome.valueOf(row.getString("lookup_outcome")),
                row.getString("fetched_at"), row.getString("refresh_failure")?.let(LookupOutcome::valueOf),
                query(db, "SELECT deviation_code FROM vehicle_check_deviations WHERE check_id = ? ORDER BY ordinal", listOf(id)) {
                    VehicleDeviation.valueOf(it.getString(1))
                }.distinct(),
                query(db, "SELECT count(*) FROM vehicle_check_deviations WHERE check_id = ? AND priority = 'HIGH'", listOf(id)) { it.getInt(1) }.single(),
                query(db, "SELECT count(*) FROM vehicle_check_deviations WHERE check_id = ? AND priority = 'MODERATE'", listOf(id)) { it.getInt(1) }.single())
        }

    private fun validatePage(page: Int, pageSize: Int) {
        require(page > 0) { "page must be a positive integer" }
        require(pageSize in 1..100) { "pageSize must be between 1 and 100" }
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
                    "comment" to input.comment,
                )
                tripDecimalColumns.forEach { values.putDecimal(it.name, it.value(input)) }
                insert(db, "trip_rows", values)
                record
            }
        }
        return AppendTripRowsResponse(now.storageTimestamp(), records.size, inputs.map { it.registrationNumber }.distinct().size, records)
    }

    override fun tripRowsForVehicle(registrationNumber: String): List<StoredTripRow> = readTransaction { db ->
        query(db, "SELECT * FROM trip_rows WHERE registration_number = ? ORDER BY created_at, id",
            listOf(validatedPlate(registrationNumber)), ::tripFrom)
    }


    override fun latestSnapshot(registrationNumber: String): RegistrySnapshot? = readTransaction { db ->
        query(db, "SELECT * FROM svv_snapshots WHERE registration_number = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1",
            listOf(validatedPlate(registrationNumber))) { snapshotFrom(db, it) }.firstOrNull()
    }

    override fun saveCheck(check: VehicleCheckResponse, newSnapshot: RegistrySnapshot?) {
        writeTransaction { db ->
            if (newSnapshot != null) database.insertRegistrySnapshot(db, newSnapshot)
            val evidence = check.agreement
            val agreement = evidence?.agreement
            insert(db, "vehicle_checks", mapOf(
                "id" to check.id, "registration_number" to check.vehicle.registrationNumber,
                "checked_at" to check.checkedAt, "vehicle_created_at" to check.vehicle.createdAt,
                "vehicle_updated_at" to check.vehicle.updatedAt, "vehicle_agreement_id" to check.vehicle.agreementId,
                "vehicle_listed" to check.vehicle.listed.asInteger(), "snapshot_id" to check.registry.snapshotId,
                "registry_data_source" to check.registry.dataSource.name, "lookup_outcome" to check.registry.lookupOutcome.name,
                "refresh_failure" to check.registry.refreshFailure?.name, "usage_prohibition_state" to check.registry.usageProhibitionState.name,
                "supplier_id" to evidence?.supplier?.id, "supplier_name" to evidence?.supplier?.name,
                "supplier_org_number" to evidence?.supplier?.orgNumber,
                "supplier_updated_at" to evidence?.supplier?.updatedAt,
                "agreement_id" to agreement?.id, "agreement_start" to agreement?.startDate, "agreement_end" to agreement?.endDate,
                "agreement_allowed" to agreement?.allowedVehicles, "agreement_note" to agreement?.note,
                "agreement_updated_at" to agreement?.updatedAt, "agreement_active" to agreement?.active?.asInteger(),
                "agreement_saksnr" to agreement?.saksnr,
            ))
            check.tripRows.forEachIndexed { index, row -> insert(db, "vehicle_check_trip_rows", mapOf(
                "check_id" to check.id, "trip_row_id" to row.id, "registration_number" to check.vehicle.registrationNumber, "ordinal" to index)) }
            check.findings.forEachIndexed { index, finding -> insert(db, "vehicle_check_deviations", mapOf(
                "check_id" to check.id, "ordinal" to index, "deviation_code" to finding.code.name,
                "priority" to finding.priority.name, "origin" to finding.origin.name, "description" to finding.description,
                "trip_row_id" to finding.tripRowId, "related_trip_row_id" to finding.relatedTripRowId,
                "snapshot_id" to if (finding.fuelIndex != null) check.registry.snapshotId else null,
                "fuel_index" to finding.fuelIndex, "measurement_index" to finding.measurementIndex)) }
        }
    }

    override fun findCheck(id: String): VehicleCheckResponse? = readTransaction { db ->
        query(db, "SELECT * FROM vehicle_checks WHERE id = ?", listOf(id)) { row ->
            val plate = row.getString("registration_number")
            val snapshot = row.getString("snapshot_id")?.let { snapshotId ->
                query(db, "SELECT * FROM svv_snapshots WHERE id = ?", listOf(snapshotId)) { snapshotFrom(db, it) }.single()
            }
            val findings = query(db, "SELECT * FROM vehicle_check_deviations WHERE check_id = ? ORDER BY ordinal", listOf(id)) {
                DeviationFinding(VehicleDeviation.valueOf(it.getString("deviation_code")), DeviationPriority.valueOf(it.getString("priority")),
                    DeviationOrigin.valueOf(it.getString("origin")), it.getString("description"), it.getString("trip_row_id"),
                    it.getString("related_trip_row_id"), it.getObject("fuel_index")?.let { _ -> it.getInt("fuel_index") },
                    it.getObject("measurement_index")?.let { _ -> it.getInt("measurement_index") })
            }
            val evidence = row.getString("agreement_id")?.let { agreementId -> AgreementEvidence(
                FleetAgreement(agreementId, row.getString("supplier_id"), row.getString("agreement_start"), row.getString("agreement_end"),
                    row.getInt("agreement_allowed"), row.getString("agreement_note"), row.getString("agreement_updated_at"), row.getInt("agreement_active") == 1,
                    saksnr = row.getString("agreement_saksnr")),
                FleetSupplier(row.getString("supplier_id"), row.getString("supplier_name"), row.getString("supplier_org_number"),
                    updatedAt = row.getString("supplier_updated_at"))) }

            VehicleCheckResponse(id, row.getString("checked_at"),
                Vehicle(plate, row.getString("vehicle_created_at"), row.getString("vehicle_agreement_id"), false,
                    row.getInt("vehicle_listed") == 1, row.getString("vehicle_updated_at")), evidence,
                query(db, "SELECT t.* FROM trip_rows t JOIN vehicle_check_trip_rows c ON c.trip_row_id = t.id WHERE c.check_id = ? ORDER BY c.ordinal", listOf(id), ::tripFrom),
                RegistryCheckResult(RegistryDataSource.valueOf(row.getString("registry_data_source")), LookupOutcome.valueOf(row.getString("lookup_outcome")),
                    fetchedAt = snapshot?.fetchedAt, registrationStatus = snapshot?.data?.registrationStatus, data = snapshot?.data,
                    deviations = findings.filter { it.origin == DeviationOrigin.REGISTRY }.map { it.code }.distinct(), snapshotId = snapshot?.id,
                    refreshFailure = row.getString("refresh_failure")?.let(LookupOutcome::valueOf)),
                findings.map { it.code }.distinct(), findings)
        }.firstOrNull()
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
                row.code("vehicle_category"), row.code("body_type"), row.code("euro_class"), fuels,
                row.getString("last_approved_inspection_date"), row.getString("next_inspection_due_date")))
    }

    private fun tripFrom(row: ResultSet): StoredTripRow {
        val plate = row.getString("registration_number")
        return StoredTripRow(row.getString("id"), plate, row.getString("source_name"), row.getString("created_at"),
            TripRowInput(
                registrationNumber = plate, periodStart = row.getString("period_start"), periodEnd = row.getString("period_end"),
                fuelTechnology = FuelTechnology.fromCode(row.getString("fuel_technology")), make = row.getString("make"),
                bodyType = BodyType.valueOf(row.getString("body_type")),
                vehicleCategory = VehicleCategory.valueOf(row.getString("vehicle_category")), model = row.getString("model"),
                co2Registered = row.boolean("co2_registered")!!, co2GramsPerKm = row.decimal("co2_grams_per_km"),
                totalTripKm = row.decimal("total_trip_km")!!,
                totalKmCo2Registered = row.decimal("total_km_co2_registered"),
                totalKmCo2NotRegistered = row.decimal("total_km_co2_not_registered")!!,
                kmFuelNotRegistered = row.decimal("km_fuel_not_registered")!!,
                totalKmFuelRegistered = row.decimal("total_km_fuel_registered")!!,
                totalKmNoxRegistered = row.decimal("total_km_nox_registered"),
                totalNoxRegisteredGrams = row.decimal("total_nox_registered_grams"),
                averageFuelConsumptionLitresPer100Km = row.decimal("average_fuel_consumption_litres_per_100_km"),
                fuelConsumedLitres = row.decimal("fuel_consumed_litres"), comment = row.getString("comment"),
            ))
    }

    private fun findOrCreateVehicle(db: Connection, plate: String, now: Instant): Vehicle {
        db.prepareStatement("INSERT OR IGNORE INTO vehicles (registration_number, created_at, updated_at) VALUES (?, ?, ?)").use {
            it.setString(1, plate)
            it.setString(2, now.storageTimestamp())
            it.setString(3, now.storageTimestamp())
            it.executeUpdate()
        }
        return query(db, "SELECT * FROM vehicles WHERE registration_number = ?", listOf(plate), ::vehicleFrom).single()
    }

    private fun validateTrip(input: TripRowInput, index: Int) {
        validateTrailerFuel(input.vehicleCategory, input.fuelTechnology, "rows[$index]")
        val start = validatedDate(input.periodStart, "rows[$index].periodStart")
        val end = validatedDate(input.periodEnd, "rows[$index].periodEnd")
        require(!end.isBefore(start)) { "rows[$index].periodEnd must not be before periodStart" }
        require(input.make.isNotBlank() && input.model.isNotBlank()) { "rows[$index].make and model must not be blank" }
        if (input.fuelTechnology.emissionsNotApplicable) {
            require(!input.co2Registered && tripDecimalColumns.filter { it.name in inapplicableEmissionColumns }.all { it.value(input) == null }) {
                "rows[$index] must report co2Registered=false and null CO2/NOx measurements and registered distances for electric/hydrogen vehicles"
            }
        } else {
            require(tripDecimalColumns.filter { it.name in inapplicableEmissionColumns }.all { it.value(input) != null }) {
                "rows[$index] must provide CO2/NOx measurements and registered distances for this fuel technology"
            }
        }
        if (input.fuelTechnology.usesLitres) {
            require(input.averageFuelConsumptionLitresPer100Km != null && input.fuelConsumedLitres != null) {
                "rows[$index] must provide both litres fields for this fuel technology"
            }
        } else {
            require(input.averageFuelConsumptionLitresPer100Km == null && input.fuelConsumedLitres == null) {
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

}
