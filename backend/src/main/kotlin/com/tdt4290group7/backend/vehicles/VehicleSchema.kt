package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal

internal data class TripDecimalColumn(val name: String, val value: (TripRowInput) -> BigDecimal?)
internal val inapplicableEmissionColumns = setOf(
    "co2_grams_per_km", "median_co2", "total_km_co2_registered", "total_km_nox_registered", "total_nox_registered_grams",
)

/** Explicit allowlist, shared by DDL and bindings. Never constructed from request keys. */
internal val tripDecimalColumns = listOf(
    TripDecimalColumn("co2_grams_per_km") { it.co2GramsPerKm },
    TripDecimalColumn("median_co2") { it.medianCo2 },
    TripDecimalColumn("total_trip_km") { it.totalTripKm },
    TripDecimalColumn("total_km_co2_registered") { it.totalKmCo2Registered },
    TripDecimalColumn("total_km_co2_not_registered") { it.totalKmCo2NotRegistered },
    TripDecimalColumn("km_fuel_not_registered") { it.kmFuelNotRegistered },
    TripDecimalColumn("total_km_fuel_registered") { it.totalKmFuelRegistered },
    TripDecimalColumn("total_km_nox_registered") { it.totalKmNoxRegistered },
    TripDecimalColumn("total_nox_registered_grams") { it.totalNoxRegisteredGrams },
    TripDecimalColumn("average_fuel_consumption_litres_per_100_km") { it.averageFuelConsumptionLitresPer100Km },
    TripDecimalColumn("fuel_consumed_litres") { it.fuelConsumedLitres },
)

private fun decimalColumns(name: String, required: Boolean = false) = """
    ${name}_unscaled INTEGER ${if (required) "NOT NULL" else ""} CHECK (${name}_unscaled >= 0),
    ${name}_scale INTEGER ${if (required) "NOT NULL" else ""} CHECK (${name}_scale BETWEEN 0 AND 18)
      CHECK ((${name}_unscaled IS NULL) = (${name}_scale IS NULL))
""".trimIndent()

private fun dateColumn(name: String, required: Boolean = false) = """
    $name TEXT ${if (required) "NOT NULL" else ""}
    CHECK ($name IS NULL OR ($name GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND date($name, '+0 days') IS NOT NULL AND date($name, '+0 days') = $name))
""".trimIndent()

private fun timestampColumn(name: String, required: Boolean = false) =
    "$name TEXT ${if (required) "NOT NULL" else ""} CHECK ($name IS NULL OR (julianday($name) IS NOT NULL AND substr($name, -1) = 'Z'))"

private fun booleanColumn(name: String, required: Boolean = false) =
    "$name INTEGER ${if (required) "NOT NULL" else ""} CHECK ($name IN (0, 1))"
private fun fuelColumn(name: String, required: Boolean = true) =
    "$name TEXT ${if (required) "NOT NULL" else ""} CHECK ($name IN (${FuelTechnology.entries.joinToString(",") { "'${it.code}'" }}))"
private inline fun <reified T : Enum<T>> enumColumn(name: String, required: Boolean = true) =
    "$name TEXT ${if (required) "NOT NULL" else ""} CHECK ($name IN (${enumValues<T>().joinToString(",") { "'${it.name}'" }}))"

internal val vehicleSchemaStatements = listOf(
    """CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, ${timestampColumn("created_at", true)}
    ) STRICT""",
    """CREATE TABLE IF NOT EXISTS vehicles (
        registration_number TEXT PRIMARY KEY
          CHECK (registration_number GLOB '[A-Z][A-Z][1-9][0-9][0-9][0-9]'
            OR registration_number GLOB '[A-Z][A-Z][1-9][0-9][0-9][0-9][0-9]'),
        supplier_id TEXT REFERENCES suppliers(id),
        ${timestampColumn("created_at", true)}
    ) STRICT""",
    """CREATE TABLE IF NOT EXISTS trip_rows (
        id TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL REFERENCES vehicles(registration_number),
        source_name TEXT,
        ${timestampColumn("created_at", true)},
        ${dateColumn("period_start", true)}, ${dateColumn("period_end", true)},
        ${fuelColumn("fuel_technology")}, ${enumColumn<VehicleCategory>("vehicle_category")},
        ${enumColumn<BodyType>("body_type")},
        make TEXT NOT NULL CHECK (length(trim(make)) > 0),
        model TEXT NOT NULL CHECK (length(trim(model)) > 0),
        ${booleanColumn("co2_registered", true)},
        trip_count INTEGER NOT NULL CHECK (trip_count BETWEEN 0 AND 2147483647),
        comment TEXT,
        ${tripDecimalColumns.joinToString(",\n") { decimalColumns(it.name, it.name !in inapplicableEmissionColumns && it.name !in listOf("average_fuel_consumption_litres_per_100_km", "fuel_consumed_litres")) }},
        CHECK ((vehicle_category IN ('O1','O2','O3','O4')) = (fuel_technology = 'NOT_APPLICABLE')),
        CHECK (CASE WHEN fuel_technology IN ('5','6','NOT_APPLICABLE') THEN
          average_fuel_consumption_litres_per_100_km_unscaled IS NULL AND fuel_consumed_litres_unscaled IS NULL
          ELSE average_fuel_consumption_litres_per_100_km_unscaled IS NOT NULL AND fuel_consumed_litres_unscaled IS NOT NULL END),
        CHECK (CASE WHEN fuel_technology IN ('5','6') THEN co2_registered = 0
          AND ${inapplicableEmissionColumns.joinToString(" AND ") { "${it}_unscaled IS NULL" }}
          ELSE ${inapplicableEmissionColumns.joinToString(" AND ") { "${it}_unscaled IS NOT NULL" }} END),
        CHECK (period_start <= period_end),
        UNIQUE (id, registration_number)
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_trip_rows_vehicle ON trip_rows(registration_number, created_at, id)",
    "CREATE INDEX IF NOT EXISTS idx_trip_rows_time ON trip_rows(created_at DESC)",
    """CREATE TABLE IF NOT EXISTS vehicle_approvals (
        id TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL REFERENCES vehicles(registration_number),
        source_name TEXT, ${fuelColumn("fuel_technology")}, ${enumColumn<VehicleCategory>("vehicle_category")},
        ${dateColumn("start_date")}, ${dateColumn("expiry_date")},
        ${timestampColumn("created_at", true)}, ${timestampColumn("updated_at", true)},
        ${timestampColumn("revoked_at")},
        CHECK (start_date IS NULL OR expiry_date IS NULL OR start_date <= expiry_date),
        CHECK ((vehicle_category IN ('O1','O2','O3','O4')) = (fuel_technology = 'NOT_APPLICABLE')),
        UNIQUE (id, registration_number)
    ) STRICT""",
    """CREATE UNIQUE INDEX IF NOT EXISTS idx_one_unrevoked_approval
       ON vehicle_approvals(registration_number) WHERE revoked_at IS NULL""",
    """CREATE TABLE IF NOT EXISTS svv_snapshots (
        id TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL REFERENCES vehicles(registration_number),
        ${timestampColumn("fetched_at", true)},
        source TEXT NOT NULL, registration_status TEXT, make TEXT, model TEXT,
        vehicle_category TEXT, vehicle_category_name TEXT,
        body_type TEXT, body_type_name TEXT,
        euro_class TEXT, euro_class_name TEXT,
        UNIQUE (id, registration_number)
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_svv_snapshots_vehicle_time ON svv_snapshots(registration_number, fetched_at DESC, id DESC)",
    """CREATE TABLE IF NOT EXISTS svv_snapshot_fuels (
        snapshot_id TEXT NOT NULL REFERENCES svv_snapshots(id),
        fuel_index INTEGER NOT NULL CHECK (fuel_index >= 0),
        fuel_technology TEXT, fuel_technology_name TEXT,
        PRIMARY KEY (snapshot_id, fuel_index)
    ) STRICT""",
    """CREATE TABLE IF NOT EXISTS svv_emission_measurements (
        snapshot_id TEXT NOT NULL, fuel_index INTEGER NOT NULL,
        measurement_index INTEGER NOT NULL CHECK (measurement_index >= 0),
        measurement_method TEXT, measurement_method_name TEXT,
        ${decimalColumns("co2_grams_per_km")}, ${decimalColumns("nox_mg_per_km")},
        PRIMARY KEY (snapshot_id, fuel_index, measurement_index),
        FOREIGN KEY (snapshot_id, fuel_index) REFERENCES svv_snapshot_fuels(snapshot_id, fuel_index)
    ) STRICT""",
    """CREATE TABLE IF NOT EXISTS vehicle_checks (
        id TEXT PRIMARY KEY,
        registration_number TEXT NOT NULL REFERENCES vehicles(registration_number),
        ${timestampColumn("checked_at", true)},
        vehicle_supplier_id TEXT REFERENCES suppliers(id),
        ${timestampColumn("vehicle_created_at", true)},
        approval_id TEXT, snapshot_id TEXT,
        ${enumColumn<ApprovalStatus>("approval_status")},
        ${enumColumn<RegistryDataSource>("registry_data_source")},
        ${enumColumn<LookupOutcome>("lookup_outcome")},
        ${enumColumn<LookupOutcome>("refresh_failure", false)},
        usage_prohibition_state TEXT NOT NULL CHECK (usage_prohibition_state = 'UNKNOWN'),
        approval_source_name TEXT, ${fuelColumn("approval_fuel_technology", false)},
        ${enumColumn<VehicleCategory>("approval_vehicle_category", false)},
        ${dateColumn("approval_start_date")}, ${dateColumn("approval_expiry_date")},
        ${timestampColumn("approval_created_at")}, ${timestampColumn("approval_updated_at")},
        ${timestampColumn("approval_revoked_at")},
        CHECK ((registry_data_source = 'UNAVAILABLE') = (snapshot_id IS NULL)),
        CHECK (snapshot_id IS NULL OR lookup_outcome = 'FOUND'),
        CHECK (refresh_failure IS NULL OR registry_data_source = 'STALE_CACHE'),
        CHECK (registry_data_source != 'STALE_CACHE' OR refresh_failure IS NOT NULL),
        CHECK (approval_id IS NULL OR (approval_created_at IS NOT NULL AND approval_updated_at IS NOT NULL)),
        FOREIGN KEY (approval_id, registration_number) REFERENCES vehicle_approvals(id, registration_number),
        FOREIGN KEY (snapshot_id, registration_number) REFERENCES svv_snapshots(id, registration_number),
        UNIQUE (id, registration_number)
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_vehicle_checks_vehicle_time ON vehicle_checks(registration_number, checked_at DESC, id DESC)",
    """CREATE TABLE IF NOT EXISTS vehicle_check_trip_rows (
        check_id TEXT NOT NULL, trip_row_id TEXT NOT NULL,
        registration_number TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        PRIMARY KEY (check_id, trip_row_id),
        UNIQUE (check_id, ordinal),
        FOREIGN KEY (check_id, registration_number) REFERENCES vehicle_checks(id, registration_number),
        FOREIGN KEY (trip_row_id, registration_number) REFERENCES trip_rows(id, registration_number)
    ) STRICT""",
    """CREATE TABLE IF NOT EXISTS vehicle_check_deviations (
        check_id TEXT NOT NULL REFERENCES vehicle_checks(id),
        ${enumColumn<VehicleDeviation>("deviation_code")},
        origin TEXT NOT NULL CHECK (origin IN ('APPROVAL','REGISTRY')),
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        PRIMARY KEY (check_id, deviation_code),
        UNIQUE (check_id, ordinal)
    ) STRICT""",
) + listOf(
    "trip_rows", "svv_snapshots", "svv_snapshot_fuels", "svv_emission_measurements",
    "vehicle_checks", "vehicle_check_trip_rows", "vehicle_check_deviations",
).map { table ->
    """CREATE TRIGGER IF NOT EXISTS immutable_${table} BEFORE UPDATE ON $table
       BEGIN SELECT RAISE(ABORT, 'Historical data is immutable'); END"""
}
