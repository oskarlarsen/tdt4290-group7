# API reference

The local API is at `http://localhost:8080`. JSON is used except for certificate PDF uploads, which use multipart form data. This reference covers implemented endpoints; the frontend's prototype APIs for other screens are not implemented on the backend.

## Authentication

Sign in through `POST /api/auth/login`:

```json
{
  "email": "advisor.hansen@kommune.no",
  "password": "your-configured-admin-password",
  "rememberMe": false
}
```

The response contains `user` and `expiresAt` and sets the `auth_token` cookie. Retain that cookie for subsequent requests; bearer tokens are not supported. All fleet, vehicle, statistics and check endpoints require a backend admin session. Supplier sessions cannot access them.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in. |
| POST | `/api/auth/logout` | Clear the session cookie. |
| GET | `/api/auth/me` | Read the signed-in user. |
| POST | `/api/auth/accept-invitation` | Accept `{ "token": "...", "newPassword": "..." }` once to activate a supplier account. |
| POST | `/api/auth/forgot-password` | Request a reset with `{ "email": "..." }`. |
| POST | `/api/auth/reset-password` | Reset with `{ "token": "...", "newPassword": "..." }`. |

Supplier invitations are created by an administrator at `POST /api/vehicle-fleet/suppliers/{id}/invitations` with `{ "email": "..." }`; the response contains a one-time token to append as a URL fragment to `/accept-invitation#...`. Share that link with the contact manually; email delivery is not configured. Invitations expire after 48 hours. Password-reset email delivery is also not connected. For local testing, enable `APP_ENV=dev` and `ALLOW_DEV_PASSWORD_RESET_LOG=true` to obtain reset tokens from the backend log. Reset tokens expire after 15 minutes and are single-use. A successful reset invalidates that user's existing sessions. New passwords must be 12–72 UTF-8 bytes.

Sign-in, reset, and invitation acceptance are rate-limited. Repeated failed sign-ins also lock the account temporarily; `429` responses include retry guidance. Accounts persist in the SQLite database configured by `USER_DB_PATH`; only the initial administrator password comes from environment configuration.

## Certificates

Certificate routes require an administrator session.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/certificates` | List extracted certificate metadata, most urgent first. |
| POST | `/api/certificates` | Upload one PDF, extract its certificate type and dates, and store the metadata. |
| PUT | `/api/certificates/{id}` | Correct saved supplier, certificate type, dates and optional contract reference. |
| DELETE | `/api/certificates/{id}` | Delete certificate metadata. |

`POST /api/certificates` accepts `multipart/form-data` fields `supplierName`, `file` and optional `contractId`. Uploads are limited to 8 MB and 25 pages. Text-based PDFs use PDFBox; scanned pages require Tesseract with Norwegian and English language data. The response includes the parsed `certificateType`, `issueDate`, `expiryDate`, `sourceFile`, `contractId` and recalculated status. Check parsed values before relying on them as compliance evidence.

`PUT /api/certificates/{id}` accepts JSON fields `supplierName`, `certificateType`, optional `issueDate`, `expiryDate` and `contractId`. Dates use `YYYY-MM-DD`; issue date cannot be after expiry. `DELETE` returns `204` when the record is removed.

The original PDF is discarded. The dashboard upload form sends the selected supplier/contract ID so certificate indicators can appear in Risk & Breach Prediction. Contract data is currently demo data; the API does not verify the ID against a backend contract record, and certificates are not linked to external certification registries.

### Shared access: colleagues and stand-ins

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/supplier/colleagues/invitations` | A supplier invites a colleague into its own organization (the organization comes from the login). Body: `email`, optional `accessEndDate` (`YYYY-MM-DD`). Returns the invitation `token` to pass on by hand. |
| `POST` | `/api/admin/team/invitations` | An admin invites another admin, same body. |
| `GET` | `/api/access` | Everyone with access: all accounts for an admin, the caller's own organization for a supplier. |
| `POST` | `/api/access/{id}/renew` | Body `accessEndDate`. Only the person who gave the access, or an admin; only when 14 days or fewer are left (or it has ended); never your own. |
| `POST` | `/api/access/{id}/revoke` | End access now. The granter or an admin; never your own, and never the seeded administrator. |
| `POST` | `/api/admin/access/{id}/approve` | An admin approves a grant so it keeps working if the person who gave it later loses access. |

`POST /api/auth/accept-invitation` takes an extra `name` (required for these invitations) so accounts can be told apart.

Rules: an end date is at most 90 days away and cannot be later than the inviter's own access; with no end date, access ends with the inviter's (or has no end if theirs has none). Access ends at midnight Oslo time after the end date. Access is checked at login and on every request, so removing or expiring it takes effect at once. An unapproved grant also ends when the person who gave it loses access; an approved one keeps working until its own end date. A pending invitation from one organization cannot be cancelled or replaced by another.

### Supplier alert feed and notifications

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/supplier/alerts` | A supplier's own alerts that are marked visible, newest first. Optional `?category=VEHICLE_COMPLIANCE` (or another alert category). |
| `GET` | `/api/notifications` | The signed-in user's notifications, newest first (any role). |
| `POST` | `/api/notifications/{id}/read` | Mark one of your notifications read. `404` for someone else's. |
| `POST` | `/api/notifications/read-all` | Mark all of your notifications read. |

A supplier sees `id`, `title`, `description`, `severity`, `category`, `dueDate`, `createdAt` and a `status` of only `OPEN` or `RESOLVED`. The admin's reason, affected item, in-progress and under-review steps and notes are never included, so alert titles and descriptions should be written for the supplier. Archived alerts are not shown.

Alerts created before suppliers could see alerts are hidden from them (`visible_to_supplier` is 0). New manual alerts, and every automatic alert, are visible. Creating a manual alert for a supplier, or the system raising a new automatic alert (including a certificate reaching its next warning level), notifies every account at that supplier once; refreshing again does not repeat it.

### Editing alerts

`PATCH /api/admin/alerts/{id}` takes any of `status`, `title`, `description`, `severity` and `dueDate` (at least one). `title`, `description`, `severity` and `dueDate` can only be changed on manual alerts: an automatic alert is rebuilt from evidence on every refresh, so editing it returns `409`. For `dueDate`, leave it out to keep it, send `""` to clear it, or send `YYYY-MM-DD`. A body with only `status` works on every alert.

### Archiving alerts and certificates

Alerts and certificates are archived, not deleted. An archived item is hidden from lists and counts, raises no alerts, and can be restored.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/admin/alerts/{id}/archive` | Archive an alert. `404` if it is missing or already archived. |
| `POST` | `/api/admin/alerts/{id}/restore` | Restore an archived alert. Alerts deleted before archiving existed cannot be restored. |
| `GET` | `/api/admin/alerts?includeArchived=true` | List alerts including archived ones (they carry `archivedAt`). |
| `POST` | `/api/certificates/{id}/archive` | Archive a certificate. Its alert is closed by the system. |
| `POST` | `/api/certificates/{id}/restore` | Restore a certificate. An alert the system closed reopens; one an admin resolved stays resolved. |
| `GET` | `/api/certificates?includeArchived=true` | List certificates including archived ones. |

The supplier's own `GET /api/supplier/certificates` includes archived certificates with `archivedAt` set, so a supplier keeps their history. A certificate upload also counts as the supplier's `lastUpdatedAt` on the admin dashboard. The `DELETE` endpoints still exist for one release so a rollback keeps working, but the app no longer calls them.

### Supplier certificate upload and renewals

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/supplier/certificates` | A supplier uploads a certificate PDF (multipart: `file`, `contractId`). The agreement must be one of the supplier's own active agreements, otherwise `403` or `400`. The supplier name comes from the agreement. Limited to 10 uploads per supplier per hour (`429`). |
| `POST` | `/api/certificates/{id}/confirm-archive` | Admin: confirm a supplier's renewal, archiving the older certificate it replaces. |
| `POST` | `/api/certificates/{id}/reject-archive` | Admin: keep both certificates and clear the pending mark. |

A new certificate replaces an older one when it is on the same agreement, has the same normalised type, and expires later. An admin's upload archives the older certificate at once. A supplier's upload only sets `archivePendingFor` on the new certificate; both stay active until an admin confirms or rejects. Certificates with no agreement or no expiry date, and `Unknown` types, are never matched. Certificate responses include `uploadedByRole` and `archivePendingFor`.

## Fleet management

An agreement belongs to a supplier and specifies dates and vehicle allowance. Vehicles are added to an agreement as registered vehicles or planned entries.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/vehicle-fleet` | Active suppliers, agreements, vehicles and recent changes. |
| GET | `/api/vehicle-fleet/history?page=1` | Change history. |
| POST | `/api/vehicle-fleet/suppliers` | Create a supplier. |
| PUT | `/api/vehicle-fleet/suppliers/{id}` | Update a supplier. |
| POST | `/api/vehicle-fleet/suppliers/{id}/invitations` | Admin creates a one-time supplier account invitation by email. |
| POST | `/api/vehicle-fleet/agreements` | Create an agreement. |
| PUT | `/api/vehicle-fleet/agreements/{id}` | Update an agreement. |
| DELETE | `/api/vehicle-fleet/agreements/{id}` | Remove an agreement and unlist its vehicles. |
| POST | `/api/vehicle-fleet/agreements/{id}/vehicles` | Add a registered/planned entry. |
| POST | `/api/vehicle-fleet/vehicles/{plate}/replace` | Replace a listed entry. |
| DELETE | `/api/vehicle-fleet/vehicles/{plate}` | Unlist a vehicle. |
| POST | `/api/vehicle-fleet/history/{id}/undo` | Undo an eligible change. |

For example, create a supplier:

```json
{ "name": "Example Transport", "orgNumber": "123456789" }
```

Use the returned supplier `id` to create an agreement:

```json
{
  "supplierId": "returned-supplier-id",
  "saksnr": "2024/1234",
  "startDate": "2026-01-01",
  "endDate": "2027-12-31",
  "allowedVehicles": 5,
  "note": "Example agreement"
}
```

`saksnr` is the municipal case number. It is required on every create and update, up to 50 characters, and several agreements may share one. Agreements created before this field existed return `saksnr: null` until they are next edited.

Add an entry using either `{ "registrationNumber": "AB12345" }` or `{ "planned": true }`. The registration number is illustrative: a registered entry must exist in Statens vegvesen and pass a live lookup. Planned identifiers are generated by the server and require no registry request. Both entry types count toward the allowance.

Updates and removals require the record's latest `updatedAt`, supplied as `expectedUpdatedAt`:

| Operation | Body |
|---|---|
| Update supplier | `{ "supplier": { "name": "...", "orgNumber": "..." }, "expectedUpdatedAt": "..." }` |
| Update agreement | `{ "agreement": { ...complete agreement input... }, "expectedUpdatedAt": "..." }` |
| Replace vehicle | `{ "replacement": { "registrationNumber": "AB12345" }, "expectedUpdatedAt": "..." }` |
| Remove agreement/vehicle | `{ "expectedUpdatedAt": "..." }` |

Stale writes return `409`. Reducing an allowance below the current count is permitted, but further additions are blocked. Replacements remain possible. History entries indicate eligibility through `canUndo`; undo takes no request body. Removal retains historical records and saved check evidence.

## Statistics and vehicle checks

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Public health check: `{ "status": "UP" }`. |
| GET | `/api/vehicles/{plate}` | Vehicle details, statistics and latest saved check. |
| GET | `/api/vehicles/{plate}/checks` | Saved check history. |
| GET | `/api/trip-rows` | Reported statistics. |
| POST | `/api/trip-rows` | Save statistics, then check each distinct plate. |
| POST | `/api/vehicle-checks` | Run and save a check. |
| GET | `/api/vehicle-checks/{id}` | Original saved check evidence. |

Statistics and vehicle-check history lists accept `page` and `pageSize` (1–100). Statistics defaults to 25 rows per page and also accepts `search`; check history defaults to 10. Their responses contain `items`, `total`, `page` and `pageSize`. Fleet overview and fleet history have their own response shapes.

### Submit statistics

`POST /api/trip-rows` accepts a batch of 1–10,000 reporting rows. A row represents a reporting period, not necessarily one journey. This example includes the required fields for a diesel passenger car:

```json
{
  "sourceName": "example-statistics",
  "rows": [{
    "registrationNumber": "AB12345",
    "periodStart": "2026-01-01",
    "periodEnd": "2026-01-31",
    "fuelTechnology": "2",
    "vehicleCategory": "M1",
    "bodyType": "AA",
    "make": "Example Make",
    "model": "Example Model",
    "co2Registered": true,
    "co2GramsPerKm": 120,
    "totalTripKm": 1000,
    "totalKmCo2Registered": 1000,
    "totalKmCo2NotRegistered": 0,
    "kmFuelNotRegistered": 0,
    "totalKmFuelRegistered": 1000,
    "totalKmNoxRegistered": 1000,
    "totalNoxRegisteredGrams": 20,
    "averageFuelConsumptionLitresPer100Km": 8,
    "fuelConsumedLitres": 80
  }]
}
```

- Distances are km, CO₂ is g/km, total NOx is grams, fuel volume is litres and average consumption is L/100km.
- For electric/hydrogen (`"5"`/`"6"`), set `co2Registered=false` and set `co2GramsPerKm`, `totalKmCo2Registered`, `totalKmNoxRegistered` and `totalNoxRegisteredGrams` to null. Both fuel-volume/consumption fields must be null or omitted.
- Unpowered trailers use categories `O1`–`O4` and fuel `NOT_APPLICABLE`; both fuel-volume/consumption fields must be null or omitted.
- Other applicable numbers are required and non-negative. Use JSON numbers/booleans and enum codes; unknown fields are rejected. Dates use `YYYY-MM-DD` with inclusive boundaries. See [VehicleCatalog.kt](../backend/src/main/kotlin/com/tdt4290group7/backend/vehicles/VehicleCatalog.kt) for codes.

An invalid row rejects the batch. Repeated submissions append duplicate rows. A successful save can still contain a failed automatic check: retry the check rather than resubmitting statistics. After an uncertain connection failure, inspect saved rows before retrying the submission.

### Run a check

`POST /api/vehicle-checks`:

```json
{ "registrationNumber": "AB12345", "forceRefresh": false }
```

A check compares saved reporting rows with agreement coverage and registry facts. Results include prioritised `findings`, registry source/outcome and saved evidence. Browsing details or history does not perform registry lookups.

Checks can reuse a registry snapshot for `SVV_CACHE_TTL_DAYS` (default 14). `forceRefresh=true` requests a new lookup. Inspect `dataSource`, `lookupOutcome`, `refreshFailure` and `fetchedAt`: an HTTP success does not establish successful registry verification. Registry sources are `LIVE`, `CACHE`, `STALE_CACHE` and `UNAVAILABLE`.

Current registry data cannot establish historical registry status. The registry endpoint does not establish usage prohibitions (`bruksforbud`). Exact comparisons are implemented in [VehicleDeviationRules.kt](../backend/src/main/kotlin/com/tdt4290group7/backend/vehicles/VehicleDeviationRules.kt).

## Supplier onboarding & dashboard

Supplier onboarding and portal endpoints support both supplier sessions (strictly scoped to their own `supplierId`) and administrator sessions (using `?supplierId=<id>` for tenant inspection).

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/onboarding/status` | Read onboarding lifecycle status and step completion. |
| `POST` | `/api/onboarding/profile` | Update sustainability contact person and email. |
| `GET` | `/api/onboarding/templates/{entity}` | Download a blank semicolon-delimited CSV header template (`vehicles`, `energy`, `products`) for Excel. Upload accepts comma- or semicolon-delimited CSV. Use active agreement IDs shown in the supplier workspace. |
| `POST` | `/api/onboarding/upload/{entity}/preview` | Multipart CSV dry-run preview with cell error reporting. |
| `POST` | `/api/onboarding/upload/{entity}/confirm` | Atomically commit a verified batch preview. |
| `POST` | `/api/onboarding/submit` | Submit dossier for municipal review. |
| `POST` | `/api/admin/onboarding/{supplierId}/review` | Administrator approval or revision request. |
| `GET` | `/api/supplier/overview` | Portal summary metrics and agreement breakdown. |
| `GET` | `/api/supplier/agreements` | List agreements assigned to the authenticated supplier. |
| `GET` | `/api/supplier/vehicles` | List vehicles linked to the supplier's agreements. |
| `GET` | `/api/supplier/energy` | List facility energy consumption records. |
| `GET` | `/api/supplier/products` | List catalog items and eco-labels. |
| `GET` | `/api/supplier/certificates` | List environmental certificates for all of the supplier's agreements, including ended ones, so older certificates stay as history. |

### Supplier notes

Notes are written by administrators about a supplier and are never shown to suppliers: no supplier route reads them.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/admin/suppliers/{supplierId}/notes` | List the caller's own `SELF` notes and every `INTERNAL` note, newest first. |
| `POST` | `/api/admin/suppliers/{supplierId}/notes` | Add a note. The author comes from the login. |

```json
{ "text": "Call the contact on Monday", "visibility": "SELF", "alertId": "optional-alert-id" }
```

`visibility` is `SELF` (only the author sees it, the default) or `INTERNAL` (every administrator sees it). `text` is 1–2000 characters after trimming. An unknown supplier returns 404 and a supplier session returns 403.

See [Supplier Onboarding Reference](supplier-onboarding.md) for full cURL examples, two-phase ingestion details, and SQLite schema DDLs.

## Errors

| Status | Meaning |
|---|---|
| `400` | Invalid JSON, fields, dates or values. |
| `401` / `403` | Missing session / administrator access required. |
| `404` | Requested record not found. |
| `409` | Stale update, capacity conflict or change that cannot be undone. |
| `429` | Rate limit or temporary sign-in lock. |
| `503` | Registry unavailable for vehicle entry, or database busy. |

Handled auth errors use `{ "message": "..." }`; fleet/vehicle errors use `{ "error": "..." }`. Registry lookup outcomes such as `NOT_CONFIGURED` can also appear inside a successfully saved check.
