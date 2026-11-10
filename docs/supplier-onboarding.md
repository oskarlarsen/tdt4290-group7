# Supplier Onboarding & Dashboard Backend Reference

This document provides technical documentation, architectural rationale, and practical usage examples for the **Supplier Onboarding & Dashboard** subsystem implemented for Trondheim kommune (Innkjøpstjenesten).

---

## 1. Subsystem Overview

The supplier onboarding subsystem transitions supplier environmental reporting from manual, ad-hoc spreadsheets and email threads (*purringer*) into an automated, strictly validated, and audit-proof municipal compliance pipeline.

### Core Objectives
1. **Multi-Tenant Data Isolation:** Suppliers authenticated with `Role.SUPPLIER` are strictly scoped to their own corporate identity (`supplierId`). They cannot read, preview, or commit records belonging to another supplier.
2. **Atomic Two-Phase Ingestion (Preview & Commit):** Spreadsheets are not committed directly to production tables upon receipt. A dry-run validation endpoint (`/preview`) checks formatting, business rules, and external registry constraints without persisting data. Only after 100% of rows pass validation can the supplier invoke `/confirm` to execute an atomic transaction.
3. **CWE-1236 Defense:** Active formula injection prevention rejects spreadsheet cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.
4. **UTF-8 with BOM Handling:** Transparently strips the byte order mark (`﻿`) commonly inserted by Microsoft Excel on Windows/Nordic locale configurations.

---

## 2. Onboarding Lifecycle & State Machine

The supplier's onboarding progress is managed through a state machine persisted in the `supplier_onboarding` SQLite table:

```
[INVITED] ──> [PROFILE_PENDING] ──> [DATA_DRAFT] ──> [VALIDATING] ──> [SUBMITTED]
                                         ^                 │               │
                                         │ (Corrections)   │ (Errors)      │
                                         └─────────────────┴───────────────┤
                                                                           v
                                                                   [UNDER_REVIEW]
                                                                    │          │
                                                    (Approved)      │          │ (Changes Req.)
                                                                    v          v
                                                               [APPROVED]  [REVISION_REQUIRED]
```

### State Definitions
- **`INVITED` / `PROFILE_PENDING`:** Initial state after administrator registers the supplier organization. The supplier must supply sustainability contact details.
- **`DATA_DRAFT`:** Contact profile is saved. The supplier can download populated CSV templates, upload file drafts, and inspect validation errors.
- **`VALIDATING`:** Transient status during asynchronous batch analysis.
- **`SUBMITTED`:** Supplier has verified that all mandatory requirements (profile, linked fleet, certifications) are met and formally submitted the onboarding dossier.
- **`UNDER_REVIEW`:** Municipal procurement advisors (*Innkjøpstjenesten*) inspect the dossier and verification logs.
- **`APPROVED`:** All criteria fulfilled. Supplier and fleet are active in operational monitoring dashboards.
- **`REVISION_REQUIRED`:** Administrator requested amendments (e.g. invalid vehicle registration, expired ISO certificate). Supplier can edit and resubmit.

---

## 3. Database Schema (SQLite STRICT)

The subsystem adds four tables to the existing SQLite storage:

### `supplier_onboarding`
Tracks onboarding lifecycle status, environmental contact person, and review notes:
```sql
CREATE TABLE IF NOT EXISTS supplier_onboarding (
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
) STRICT;
```

### `upload_batches`
Provides an immutable audit trail of CSV uploads, verification results, and commit states:
```sql
CREATE TABLE IF NOT EXISTS upload_batches (
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
) STRICT;
```

### `facility_energy`
Persists operating depot/workshop surface areas and annual energy balances:
```sql
CREATE TABLE IF NOT EXISTS facility_energy (
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
) STRICT;
```

### `contract_products`
Persists delivered goods and accredited eco-labels (Svanemerket, Möbelfakta, etc.):
```sql
CREATE TABLE IF NOT EXISTS contract_products (
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
) STRICT;
```

---

## 4. API Endpoints Reference

All endpoints require authentication via JWT cookie (`auth_token`).

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/onboarding/status` | SUPPLIER, ADMIN | Retrieves current onboarding status and step completion. |
| `POST` | `/api/onboarding/profile` | SUPPLIER, ADMIN | Updates sustainability contact details. |
| `GET` | `/api/onboarding/templates/{entity}` | SUPPLIER, ADMIN | Downloads CSV template pre-populated with active agreement IDs. `{entity}` can be `vehicles`, `energy`, or `products`. |
| `POST` | `/api/onboarding/upload/{entity}/preview` | SUPPLIER, ADMIN | Uploads a CSV (multipart) for dry-run parsing, formula sanitization, and error preview. |
| `POST` | `/api/onboarding/upload/{entity}/confirm` | SUPPLIER, ADMIN | Atomically commits a previously previewed valid batch. |
| `POST` | `/api/onboarding/submit` | SUPPLIER, ADMIN | Submits the onboarding dossier for municipal review. |
| `POST` | `/api/admin/onboarding/{supplierId}/review` | ADMIN | Approves or requests changes on a supplier's submission. |
| `GET` | `/api/supplier/overview` | SUPPLIER, ADMIN | Returns consolidated KPI counts and status for the supplier portal. |
| `GET` | `/api/supplier/agreements` | SUPPLIER, ADMIN | Returns framework agreements assigned to the authenticated supplier. |
| `GET` | `/api/supplier/vehicles` | SUPPLIER, ADMIN | Lists vehicles registered under the supplier's agreements. |
| `GET` | `/api/supplier/energy` | SUPPLIER, ADMIN | Lists facility energy records for the supplier's agreements. |
| `GET` | `/api/supplier/products` | SUPPLIER, ADMIN | Lists catalog goods and eco-labels for the supplier's agreements. |
| `GET` | `/api/supplier/certificates` | SUPPLIER, ADMIN | Lists uploaded environmental certificates linked to the supplier's contracts. |

---

## 5. End-to-End Usage Examples (cURL)

### Step 1: Create an organization and invite a supplier contact

Create the supplier organization in the administrator's Vehicles workspace, then select **Invite account** on its card. The UI displays a one-time link to share with the contact. No email delivery service is configured yet.

The invitation endpoint returns a token:

```bash
curl -X POST http://localhost:8080/api/vehicle-fleet/suppliers/SUPPLIER_ID/invitations \
  -b admin_cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"contact@example.no"}'
```

Open `/accept-invitation#TOKEN` from the returned token to choose a password. Activation creates the account with the supplier organization's ID; the contact can then sign in normally.

### Step 2: Sign In as Supplier
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "contact@example.no",
    "password": "the-password-chosen-during-activation",
    "rememberMe": false
  }'
```

### Step 3: Check Initial Onboarding Status
```bash
curl -X GET http://localhost:8080/api/onboarding/status \
  -b cookies.txt
```
**Sample Response:**
```json
{
  "supplierId": "nordvik-transport",
  "status": "INVITED",
  "steps": [
    {
      "stepKey": "PROFILE",
      "title": "Environmental & Compliance Contact",
      "isCompleted": false,
      "detail": "Contact details required"
    },
    {
      "stepKey": "AGREEMENTS",
      "title": "Framework Agreements Linked",
      "isCompleted": true,
      "detail": "1 active contract(s) registered"
    },
    {
      "stepKey": "FLEET",
      "title": "Contract Vehicle Fleet",
      "isCompleted": false,
      "detail": "0 vehicle(s) registered"
    },
    {
      "stepKey": "CERTIFICATES",
      "title": "Environmental Certifications (ISO/Miljøfyrtårn)",
      "isCompleted": false,
      "detail": "0 certificate(s) uploaded"
    },
    {
      "stepKey": "ENERGY",
      "title": "Facilities & Energy Balance (Optional/Conditional)",
      "isCompleted": false,
      "detail": "0 facility record(s) submitted"
    }
  ],
  "reviewerNotes": null,
  "canSubmit": false
}
```

### Step 3: Update Sustainability Contact Profile
```bash
curl -X POST http://localhost:8080/api/onboarding/profile \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "contactName": "Kari Nordmann",
    "contactEmail": "miljo@nordvik.no",
    "contactPhone": "+47 912 34 567"
  }'
```
**Sample Response:**
```json
{
  "supplierId": "nordvik-transport",
  "name": "Nordvik Transport AS",
  "orgNumber": "987654321",
  "status": "DATA_DRAFT",
  "contactName": "Kari Nordmann",
  "contactEmail": "miljo@nordvik.no",
  "contactPhone": "+47 912 34 567",
  "submittedAt": null,
  "reviewedAt": null,
  "reviewerNotes": null,
  "updatedAt": "2026-11-03T14:30:00.000Z"
}
```

### Step 4: Download a Blank Fleet CSV Template
```bash
curl -X GET http://localhost:8080/api/onboarding/templates/vehicles \
  -b cookies.txt \
  -OJ
```
This downloads `vehicles_template.csv` with the exact column names and order expected by the importer, but no example records. The template uses semicolons so Excel in comma-decimal locales opens each field in its own column. The importer accepts both semicolon- and comma-delimited CSV. Use the active agreement IDs shown in the supplier dashboard for each row. This avoids copying fictional vehicle, energy, or product data into a real submission.

### Step 5: Upload Fleet CSV for Dry-Run Preview
Prepare `fleet.csv`:
```csv
agreement_id,registration_number,is_planned,fuel_technology,is_hybrid,full_contract_coverage,start_year_week,end_year_week,attachment_reference,notes
YOUR_ACTIVE_AGREEMENT_ID,GA11958,FALSE,SVV_FUEL_CODE,FALSE,TRUE,,,,
YOUR_ACTIVE_AGREEMENT_ID,,TRUE,SVV_FUEL_CODE,FALSE,FALSE,2026-W30,2027-W52,,Planned vehicle
```
**Fuel and hybrid status are filled in for you.** For a registered vehicle, `fuel_technology` and `is_hybrid` can be left blank (the template leaves `is_hybrid` out; files that include either column still work). At preview, the backend asks Statens vegvesen for the vehicle and fills both in, and the preview table shows which rows were filled in and which the supplier entered. A fuel the supplier enters is kept and not looked up. A row can end up with an error instead:

| Situation | Result |
|---|---|
| Plate not found in Statens vegvesen | The row is blocked: "<plate> was not found in Statens vegvesen." |
| Registry unavailable, over quota or lists no usable fuel | The row is blocked: "could not be checked. Fill in fuel_technology yourself, or try again later." |
| Planned vehicle (no plate) | `fuel_technology` is required: there is nothing to look up. |
| More than 50 vehicles needing a lookup in one preview | The rest are marked "could not be checked". A file that already has errors is not looked up at all. |

A vehicle with both a combustion fuel and electricity (a plug-in hybrid) is stored as hybrid with the combustion fuel. When the registry knows the vehicle category, the category is stored so lists can show a weight range ("3,500 to 12,000 kg"); no other registry fields are kept.

The values above are placeholders to illustrate the format only; replace them with the supplier's real data. `fuel_technology` must use the Statens vegvesen catalog code. Use `TRUE`/`FALSE` for flags; partial contract coverage requires both weeks in `YYYY-Www` format. The supplier dashboard includes a field guide for vehicle, energy, and product CSVs. Fuel technology, hybrid status, contract coverage, coverage weeks, attachment reference, and notes are retained with each imported vehicle and returned by `GET /api/supplier/vehicles`.

Upload for dry-run verification:
```bash
curl -X POST http://localhost:8080/api/onboarding/upload/vehicles/preview \
  -b cookies.txt \
  -F "file=@fleet.csv;type=text/csv"
```
**Sample Response:**
```json
{
  "batchId": "batch-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "entityType": "VEHICLES",
  "fileName": "fleet.csv",
  "totalRows": 2,
  "validRows": 2,
  "errorRows": 0,
  "canCommit": true,
  "errors": [],
  "previewRows": [
    {
      "agreement_id": "AGR-NORDVIK-01",
      "registration_number": "GA11958",
      "is_planned": "FALSE",
      "fuel_technology": "13",
      "is_hybrid": "FALSE",
      "full_contract_coverage": "TRUE",
      "notes": "Euro VI biogassbuss"
    },
    {
      "agreement_id": "AGR-NORDVIK-01",
      "registration_number": "",
      "is_planned": "TRUE",
      "fuel_technology": "5",
      "is_hybrid": "FALSE",
      "full_contract_coverage": "FALSE",
      "start_year_week": "2026-W30",
      "end_year_week": "2027-W52",
      "notes": "Planlagt el-buss"
    }
  ]
}
```

### Step 6: Atomically Confirm and Commit the Batch
```bash
curl -X POST http://localhost:8080/api/onboarding/upload/vehicles/confirm \
  -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "batch-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }'
```
**Sample Response:**
```json
{
  "batchId": "batch-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "entityType": "VEHICLES",
  "importedRows": 2,
  "message": "Successfully committed 2 vehicles record(s)."
}
```

### Step 7: Inspect Supplier Dashboard
```bash
curl -X GET http://localhost:8080/api/supplier/overview \
  -b cookies.txt
```
**Sample Response:**
```json
{
  "supplierId": "nordvik-transport",
  "supplierName": "Nordvik Transport AS",
  "orgNumber": "987654321",
  "onboardingStatus": "DATA_DRAFT",
  "agreements": [
    {
      "id": "AGR-NORDVIK-01",
      "note": "Nordvik School Bus Agreement",
      "startDate": "2026-01-01",
      "endDate": "2027-12-31",
      "allowedVehicles": 10,
      "activeVehiclesCount": 2,
      "active": true
    }
  ],
  "totalVehicles": 2,
  "totalCertificates": 1,
  "totalEnergyRecords": 0,
  "totalProducts": 0
}
```

### Step 8: Formally Submit Onboarding Dossier
Before submission, the supplier must have a contact profile, a linked fleet (when an agreement exists), and at least one certificate linked to one of its agreements. An administrator uploads and links the certificate through the certificate-management workflow. Energy reporting remains optional.

```bash
curl -X POST http://localhost:8080/api/onboarding/submit \
  -b cookies.txt
```
**Sample Response:**
```json
{
  "supplierId": "nordvik-transport",
  "status": "SUBMITTED",
  "steps": [ ... ],
  "canSubmit": false
}
```

### Step 9: Administrator Reviews and Approves
```bash
curl -X POST http://localhost:8080/api/admin/onboarding/nordvik-transport/review \
  -b admin_cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "action": "APPROVE",
    "notes": "Vehicle registrations, propulsion standards, and ISO 14001 certificate verified."
  }'
```

---

## 6. Running Automated Tests

Execute the unit and integration test suites:
```bash
./gradlew test --tests "com.tdt4290group7.backend.onboarding.*"
```
On Windows:
```cmd
gradlew.bat test --tests "com.tdt4290group7.backend.onboarding.*"
```
The test suite validates:
- UTF-8 with BOM stripping and header casing.
- Formula injection detection (CWE-1236).
- Format and business constraints for vehicles, energy balances, and product catalogs.
- Duplicate energy and product business keys within a CSV upload.
- Multi-tenant isolation (rejection of cross-supplier agreement IDs).
- Full end-to-end lifecycle from `INVITED` to `APPROVED`.
