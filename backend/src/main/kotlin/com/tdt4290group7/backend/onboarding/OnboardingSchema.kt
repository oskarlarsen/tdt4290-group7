package com.tdt4290group7.backend.onboarding

internal val onboardingSchemaStatements = listOf(
    """CREATE TABLE IF NOT EXISTS supplier_onboarding (
        supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id),
        status TEXT NOT NULL CHECK (status IN (
            'INVITED', 'PROFILE_PENDING', 'DATA_DRAFT',
            'VALIDATING', 'SUBMITTED', 'UNDER_REVIEW',
            'APPROVED', 'REVISION_REQUIRED'
        )),
        contact_name TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        submitted_at TEXT CHECK (submitted_at IS NULL OR (julianday(submitted_at) IS NOT NULL AND substr(submitted_at, -1) = 'Z')),
        reviewed_at TEXT CHECK (reviewed_at IS NULL OR (julianday(reviewed_at) IS NOT NULL AND substr(reviewed_at, -1) = 'Z')),
        reviewer_notes TEXT,
        updated_at TEXT NOT NULL CHECK (julianday(updated_at) IS NOT NULL AND substr(updated_at, -1) = 'Z')
    ) STRICT""",

    """CREATE TABLE IF NOT EXISTS upload_batches (
        id TEXT PRIMARY KEY,
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        agreement_id TEXT REFERENCES agreements(id),
        entity_type TEXT NOT NULL CHECK (entity_type IN ('VEHICLES', 'ENERGY', 'PRODUCTS')),
        file_name TEXT NOT NULL,
        file_hash_sha256 TEXT NOT NULL,
        total_rows INTEGER NOT NULL CHECK (total_rows >= 0),
        valid_rows INTEGER NOT NULL CHECK (valid_rows >= 0),
        error_rows INTEGER NOT NULL CHECK (error_rows >= 0),
        status TEXT NOT NULL CHECK (status IN ('PREVIEWED', 'COMMITTED', 'DISCARDED')),
        created_at TEXT NOT NULL CHECK (julianday(created_at) IS NOT NULL AND substr(created_at, -1) = 'Z'),
        committed_at TEXT CHECK (committed_at IS NULL OR (julianday(committed_at) IS NOT NULL AND substr(committed_at, -1) = 'Z'))
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_upload_batches_supplier ON upload_batches(supplier_id, created_at DESC)",

    """CREATE TABLE IF NOT EXISTS vehicle_contract_details (
        registration_number TEXT PRIMARY KEY REFERENCES vehicles(registration_number),
        fuel_technology TEXT NOT NULL,
        is_hybrid INTEGER NOT NULL CHECK (is_hybrid IN (0, 1)),
        full_contract_coverage INTEGER NOT NULL CHECK (full_contract_coverage IN (0, 1)),
        start_year_week TEXT,
        end_year_week TEXT,
        attachment_reference TEXT,
        notes TEXT,
        updated_at TEXT NOT NULL CHECK (julianday(updated_at) IS NOT NULL AND substr(updated_at, -1) = 'Z'),
        vehicle_category TEXT,
        CHECK (full_contract_coverage = 1 OR (start_year_week IS NOT NULL AND end_year_week IS NOT NULL))
    ) STRICT""",

    """CREATE TABLE IF NOT EXISTS facility_energy (
        id TEXT PRIMARY KEY,
        agreement_id TEXT NOT NULL REFERENCES agreements(id),
        location_code TEXT NOT NULL,
        address TEXT NOT NULL,
        storage_area_sqm REAL CHECK (storage_area_sqm IS NULL OR storage_area_sqm >= 0),
        workshop_area_sqm REAL CHECK (workshop_area_sqm IS NULL OR workshop_area_sqm >= 0),
        other_area_sqm REAL CHECK (other_area_sqm IS NULL OR other_area_sqm >= 0),
        reporting_year INTEGER NOT NULL CHECK (reporting_year BETWEEN 2020 AND 2030),
        electricity_kwh REAL NOT NULL CHECK (electricity_kwh >= 0),
        district_heating_kwh REAL NOT NULL CHECK (district_heating_kwh >= 0),
        biogas_kwh REAL DEFAULT 0.0 CHECK (biogas_kwh >= 0),
        fossil_fuel_kwh REAL DEFAULT 0.0 CHECK (fossil_fuel_kwh >= 0),
        self_produced_solar_kwh REAL DEFAULT 0.0 CHECK (self_produced_solar_kwh >= 0),
        self_produced_heatpump_kwh REAL DEFAULT 0.0 CHECK (self_produced_heatpump_kwh >= 0),
        notes TEXT,
        created_at TEXT NOT NULL CHECK (julianday(created_at) IS NOT NULL AND substr(created_at, -1) = 'Z'),
        updated_at TEXT NOT NULL CHECK (julianday(updated_at) IS NOT NULL AND substr(updated_at, -1) = 'Z'),
        UNIQUE (agreement_id, location_code, reporting_year)
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_facility_energy_agreement ON facility_energy(agreement_id, reporting_year)",

    """CREATE TABLE IF NOT EXISTS contract_products (
        id TEXT PRIMARY KEY,
        agreement_id TEXT NOT NULL REFERENCES agreements(id),
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_category TEXT NOT NULL CHECK (product_category IN (
            'FURNITURE', 'IT_EQUIPMENT', 'FOOD_BEVERAGE', 'CLEANING_SUPPLIES', 'OTHER'
        )),
        ecolabel_standard TEXT NOT NULL CHECK (ecolabel_standard IN (
            'NORDIC_SWAN', 'EU_ECOLABEL', 'MOBELFAKTA', 'BLUE_ANGEL', 'OEKO_TEX', 'EPD', 'NONE'
        )),
        license_number TEXT,
        unit_of_measure TEXT NOT NULL CHECK (unit_of_measure IN ('PCS', 'KG', 'LITRE')),
        is_repaired_or_reused INTEGER NOT NULL CHECK (is_repaired_or_reused IN (0, 1)),
        notes TEXT,
        created_at TEXT NOT NULL CHECK (julianday(created_at) IS NOT NULL AND substr(created_at, -1) = 'Z'),
        updated_at TEXT NOT NULL CHECK (julianday(updated_at) IS NOT NULL AND substr(updated_at, -1) = 'Z'),
        UNIQUE (agreement_id, product_code)
    ) STRICT""",
    "CREATE INDEX IF NOT EXISTS idx_contract_products_agreement ON contract_products(agreement_id, product_code)"
)
