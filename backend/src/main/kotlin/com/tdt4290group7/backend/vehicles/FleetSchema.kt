package com.tdt4290group7.backend.vehicles

private val supplierColumns = "name TEXT NOT NULL, org_number TEXT NOT NULL, updated_at TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1))"
private fun agreementColumns(references: Boolean) = """
    supplier_id TEXT NOT NULL ${if (references) "REFERENCES suppliers(id)" else ""},
    start_date TEXT NOT NULL CHECK(date(start_date, '+0 days') = start_date),
    end_date TEXT NOT NULL CHECK(date(end_date, '+0 days') = end_date),
    allowed_vehicles INTEGER NOT NULL CHECK(allowed_vehicles BETWEEN 0 AND 10000),
    note TEXT NOT NULL, updated_at TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
    requires_vehicles INTEGER NOT NULL DEFAULT 1 CHECK(requires_vehicles IN (0,1)),
    requires_energy INTEGER NOT NULL DEFAULT 0 CHECK(requires_energy IN (0,1)),
    requires_products INTEGER NOT NULL DEFAULT 0 CHECK(requires_products IN (0,1)),
    saksnr TEXT,
    CHECK(start_date <= end_date)
""".trimIndent()
private fun vehicleColumns(references: Boolean) = """
    agreement_id TEXT ${if (references) "REFERENCES agreements(id)" else ""},
    planned INTEGER NOT NULL DEFAULT 0 CHECK(planned IN (0,1)),
    listed INTEGER NOT NULL DEFAULT 0 CHECK(listed IN (0,1)),
    exception_approved INTEGER NOT NULL DEFAULT 0 CHECK(exception_approved IN (0,1)),
    registry_problem TEXT CHECK(registry_problem IS NULL OR registry_problem IN ('NOT_FOUND','UNAVAILABLE')),
    exception_note TEXT CHECK(exception_note IS NULL OR length(exception_note) <= 500),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    CHECK(listed = 0 OR agreement_id IS NOT NULL),
    CHECK((planned = 1 AND registration_number GLOB 'PLAN*') OR
      (planned = 0 AND (registration_number GLOB '[A-Z][A-Z][1-9][0-9][0-9][0-9]' OR
        registration_number GLOB '[A-Z][A-Z][1-9][0-9][0-9][0-9][0-9]')))
""".trimIndent()

/** One row per truck and agreement: the same registration number can be listed under several agreements. */
private fun usageColumns(references: Boolean) = """
    registration_number TEXT NOT NULL ${if (references) "REFERENCES vehicles(registration_number)" else ""},
    agreement_id TEXT NOT NULL ${if (references) "REFERENCES agreements(id)" else ""},
    planned INTEGER NOT NULL DEFAULT 0 CHECK(planned IN (0,1)),
    listed INTEGER NOT NULL DEFAULT 0 CHECK(listed IN (0,1)),
    exception_approved INTEGER NOT NULL DEFAULT 0 CHECK(exception_approved IN (0,1)),
    registry_problem TEXT CHECK(registry_problem IS NULL OR registry_problem IN ('NOT_FOUND','UNAVAILABLE')),
    exception_note TEXT CHECK(exception_note IS NULL OR length(exception_note) <= 500),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
""".trimIndent()

internal val fleetSchemaStatements = listOf(
    "CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, $supplierColumns) STRICT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_org ON suppliers(org_number)",
    "CREATE TABLE IF NOT EXISTS agreements (id TEXT PRIMARY KEY, ${agreementColumns(true)}) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_agreement_supplier ON agreements(supplier_id)",
    "CREATE TABLE IF NOT EXISTS vehicles (registration_number TEXT PRIMARY KEY, ${vehicleColumns(true)}) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_vehicle_agreement ON vehicles(agreement_id, listed)",
    // vehicles.agreement_id, planned and listed are the old one-agreement-per-truck columns: frozen, kept so older data still reads.
    "CREATE TABLE IF NOT EXISTS vehicle_usages (id TEXT PRIMARY KEY, ${usageColumns(true)}, UNIQUE(registration_number, agreement_id)) STRICT",
    "CREATE INDEX IF NOT EXISTS idx_usage_agreement ON vehicle_usages(agreement_id, listed)",
    "CREATE INDEX IF NOT EXISTS idx_usage_plate ON vehicle_usages(registration_number)",
    """CREATE TABLE IF NOT EXISTS fleet_changes (
        id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
        description TEXT NOT NULL, agreement_id TEXT REFERENCES agreements(id),
        undo_of TEXT UNIQUE REFERENCES fleet_changes(id)
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_fleet_changes_time ON fleet_changes(occurred_at DESC)",
    "CREATE TABLE IF NOT EXISTS change_suppliers (change_id TEXT NOT NULL REFERENCES fleet_changes(id), phase TEXT NOT NULL CHECK(phase IN ('BEFORE','AFTER')), id TEXT NOT NULL, $supplierColumns, PRIMARY KEY(change_id,phase,id)) STRICT",
    "CREATE TABLE IF NOT EXISTS change_agreements (change_id TEXT NOT NULL REFERENCES fleet_changes(id), phase TEXT NOT NULL CHECK(phase IN ('BEFORE','AFTER')), id TEXT NOT NULL, ${agreementColumns(false)}, PRIMARY KEY(change_id,phase,id)) STRICT",
    "CREATE TABLE IF NOT EXISTS change_vehicles (change_id TEXT NOT NULL REFERENCES fleet_changes(id), phase TEXT NOT NULL CHECK(phase IN ('BEFORE','AFTER')), registration_number TEXT NOT NULL, ${vehicleColumns(false)}, PRIMARY KEY(change_id,phase,registration_number)) STRICT",
    "CREATE TABLE IF NOT EXISTS change_vehicle_usages (change_id TEXT NOT NULL REFERENCES fleet_changes(id), phase TEXT NOT NULL CHECK(phase IN ('BEFORE','AFTER')), id TEXT NOT NULL, ${usageColumns(false)}, PRIMARY KEY(change_id,phase,id)) STRICT",
) + listOf("fleet_changes", "change_suppliers", "change_agreements", "change_vehicles", "change_vehicle_usages").flatMap { table ->
    listOf("UPDATE", "DELETE").map { operation ->
        "CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation} BEFORE $operation ON $table BEGIN SELECT RAISE(ABORT, 'Change history is immutable'); END"
    }
}
