# Backend guide

For vehicle work, start with [Vehicle API](#vehicle-api), [request examples](#statistics) and [deviation rules](#checks-and-deviations).
The frontend guide is in [frontend/README.md](../frontend/README.md).

## Run and configure

Use JDK 21 and the checked-in Gradle wrapper. Docker/Rancher Desktop is optional. An Statens Vegvesen Enkeltoppslag key is required only for live requests.

Configure root `.env` once using [the shared setup](../README.md#shared-local-configuration). Fill its required JWT secret and seed passwords privately, optionally adding the Statens Vegvesen key. Then from `backend/` in PowerShell:

```powershell
.\gradlew.bat test
.\gradlew.bat run
```

Tests do not start a persistent Postman server. They use throwaway credentials, an isolated database and `BACKEND_ENV_FILE` pointing to an absent test-only file, with live Statens Vegvesen disabled; they never load root `.env`. Keep the run terminal open; stop with `Ctrl+C`.

Configuration regression checks are available from the repository root:

```powershell
.\scripts\tests\Migrate-LocalEnv.Tests.ps1
# Build the distribution first; this does not start your normal database.
.\backend\gradlew.bat -p backend installDist
.\scripts\tests\Backend-RootEnv.Smoke.ps1
```

The migration tests use a synthetic temporary directory. The startup smoke uses a fake checkout and synthetic `.env` under ignored `backend/build/test-data/`, launches Java hidden on an available loopback port, verifies auth cookies/CORS/isolated SQLite/disabled Statens Vegvesen, and stops that test server. It never opens the development database or makes an Statens Vegvesen request. Synthetic test artifacts remain available locally for troubleshooting.

| Setting | Default | Where to set | Meaning |
|---|---|---|---|
| `SVV_API_KEY` | Unset | Process environment or root `.env` | Private key enabling live Statens Vegvesen requests |
| `SVV_CACHE_TTL_DAYS` | `14` | Process environment or root `.env` | Positive whole days a successful snapshot may be reused |
| `VEHICLE_DB_PATH` | `data/vehicles.db` | Process environment or root `.env` | SQLite path; relative paths use the server working directory; Compose uses its own volume path |
| `HOST` | `127.0.0.1` | Process environment or root `.env` | Standalone listening interface; container default is `0.0.0.0` |
| `PORT` | `8080` | Process environment or root `.env` | Standalone HTTP port; Compose fixes container port at 8080 |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Process environment or root `.env` | Comma-separated full frontend origins; root template includes Vite 5173 and Docker 3000; include schemes and omit paths |

All application settings, including authentication, cookies, CORS, proxy hops and optional `TESSERACT_PATH`, use the same root `.env`. Launching from the repository root or `backend/` finds that file; retired `backend/.env` is not read. Explicit process values take precedence, **including blank values**: a blank `SVV_API_KEY` disables live calls, and blank required secrets fail startup. Remove a PowerShell override with e.g. `Remove-Item Env:SVV_API_KEY` to return to the saved value. Invalid, zero, negative, or oversized TTL values fall back to 14. Restart after configuration changes.

Use single-line literal values. Unquoted values trim whitespace and allow whitespace followed by an inline `#` comment. Single quotes preserve `$`, `#` and backslashes literally; double quotes support common backslash escapes. The standalone loader deliberately does not perform variable expansion, shell execution, multiline values or `export` directives. Use the common literal subset shown by root `.env.example` rather than Compose/Vite-specific syntax. Keep each key unique.

Advanced: `BACKEND_ENV_FILE` can be supplied in the process environment to select a different file (relative to the server working directory or absolute). Tests use this to avoid local configuration. Packaged deployments without checkout markers fall back to working-directory `.env`; normally inject process settings instead and do not bundle a file. Relative database paths always use the working directory, not the configuration-file directory.

Example optional values in root `.env` (the required authentication fields must also be filled):

```dotenv
SVV_API_KEY=your-private-key-here
SVV_CACHE_TTL_DAYS=14
```

For isolated manual testing:

```powershell
$env:VEHICLE_DB_PATH = "data/manual-test.db"
$env:CORS_ALLOWED_ORIGINS = "http://localhost:5173"
.\gradlew.bat run
```

These settings apply to that PowerShell session and its child processes. Postman environment variables configure requests, not the backend process.

The key must never be sent to our API, exposed through a `VITE_` variable, or committed. Root `.env` and migration backups are ignored by Git; the root file is outside both Docker build contexts. Root `.env.example` contains no secret. Vite exposes public `VITE_` fields only, not backend credentials.

JWT authentication is available for the auth routes documented below. Vehicle routes are still unauthenticated and have no role/supplier access restrictions. CORS does not provide authorization. The standalone default host and Compose's published backend port are bound to loopback for local development. Local processes can still access these endpoints; authentication and authorization must be implemented before deployment or exposure to other machines.

### Docker

From `backend/`:

```powershell
docker build -t ktor-backend .
docker run --env-file ../.env -e HOST=0.0.0.0 -e PORT=8080 -e VEHICLE_DB_PATH=/app/data/vehicles.db -p 127.0.0.1:8080:8080 -v vehicle-backend-data:/app/data ktor-backend
```

The key and required authentication settings are supplied at runtime from root `.env`. Docker's raw `--env-file` parser differs from Compose's dotenv parser: use simple unquoted values for this standalone command; prefer Compose for the documented quoted literal values. The named volume preserves SQLite across container replacement. The image initializes a new data volume for the unprivileged `app` user. Existing volumes created by an older root-running image may need an ownership migration before startup; do not delete stored vehicle data. Compose keeps the root filesystem read-only, with only the data volume and JVM scratch directory writable, and retains its capability and privilege restrictions. This command publishes only on the host loopback interface.

For the full stack, use the [root README](../README.md#run-the-full-stack-with-docker). Compose reads the same root `.env`, requires JWT/seed-password settings, passes selected backend settings, and mounts persistent vehicle storage. Public frontend build arguments are passed separately; no backend secrets enter the frontend build. Standalone auth settings also load from root `.env` automatically. The existing malformed Gradle command in `backend/Dockerfile` remains a separate build blocker; see the root guide before trying a full image build.

## Authentication

Vehicle records use SQLite, but the separate authentication user store is currently in memory. These demo accounts are seeded at startup:

| Email                          | Role     | Password env var         |
| ------------------------------- | -------- | ------------------------- |
| `advisor.hansen@kommune.no`     | ADMIN    | `SEED_ADMIN_PASSWORD`     |
| `supplier@nordvik.no`           | SUPPLIER | `SEED_SUPPLIER_PASSWORD`  |

Both seed password env vars are required: the backend refuses to start if
either is missing or blank.

Endpoints (all under `/api/auth`):

- `POST /login` — `{ email, password, rememberMe }` → `{ expiresAt, user }`, and sets the
  `auth_token` cookie (HttpOnly, SameSite=Strict, Secure, path `/api`). With `rememberMe` the
  cookie lasts 30 days; otherwise it is a session cookie.
- `POST /logout` — clears the `auth_token` cookie
- `GET /me` — requires the `auth_token` cookie, returns the current user
- `POST /forgot-password` — `{ email }`, always responds `200` (no account enumeration)
- `POST /reset-password` — `{ token, newPassword }`, token is single-use and valid for 15 minutes;
  a successful reset invalidates every JWT previously issued to that user

There is no email delivery yet. To test the reset flow locally, set
`APP_ENV=dev` and `ALLOW_DEV_PASSWORD_RESET_LOG=true`, and the reset
token is written to the backend log. Anyone who can read the logs can take over
any account, so the backend refuses to start with this flag unless
`APP_ENV=dev`.

The JWT is only ever sent as that HttpOnly cookie, so page scripts can't read it;
`Authorization` headers are ignored. Because the cookie is `SameSite=Strict`, the
frontend and the API must be served from the same site (e.g. `localhost:3000` and
`localhost:8080`, or `app.example.no` and `api.example.no`). Requests from origins
not in `CORS_ALLOWED_ORIGINS` are rejected with `403`.

`/login`, `/forgot-password`, and `/reset-password` are rate-limited to 10 requests/minute per
client IP. Behind a load balancer or ingress, set `TRUSTED_PROXY_HOPS` so the
limit applies per real client instead of to everyone at once.

On top of that, each account is locked after 5 consecutive failed logins: first
for 30 seconds, doubling with every further failure up to 15 minutes. While
locked, `/login` answers `429` with a `Retry-After` header without checking the
password. The lock is keyed on the submitted email, so unknown emails behave the
same and it can't be used to discover accounts. A successful login or password
reset clears it. Failures older than an hour are forgotten.

New passwords (via `/reset-password`) must be 12–72 bytes long; there are no
character-class rules, following NIST SP 800-63B.

Relevant environment variables:

| Variable                 | Default                                 | Purpose                                   |
| ------------------------- | --------------------------------------- | ------------------------------------------ |
| `JWT_SECRET`               | none — required, startup fails if unset | Signs and verifies JWTs                   |
| `JWT_ISSUER`                | `tdt4290-backend`                       | JWT `iss` claim                           |
| `JWT_AUDIENCE`              | `tdt4290-frontend`                      | JWT `aud` claim                           |
| `SEED_ADMIN_PASSWORD`       | none — required, startup fails if unset | Password for the seeded admin account     |
| `SEED_SUPPLIER_PASSWORD`    | none — required, startup fails if unset | Password for the seeded supplier account  |
| `APP_ENV`                   | `prod`                                  | `dev` or `prod`; dev-only features refuse to start in `prod` |
| `ALLOW_DEV_PASSWORD_RESET_LOG` | `false`                            | Log password reset tokens; requires `APP_ENV=dev` |
| `AUTH_COOKIE_SECURE`        | `true`                                  | Set `false` only if a local browser drops Secure cookies on `http://localhost` (Safari) |
| `TRUSTED_PROXY_HOPS`        | `0`                                     | Number of proxies in front of the backend; client IPs for rate limiting are then read from `X-Forwarded-For`. Keep `0` if clients connect directly, or the header can be spoofed |
| `CORS_ALLOWED_ORIGINS`      | `http://localhost:5173`                 | Comma-separated full origins (`scheme://host[:port]`) allowed to call the API. Each allows only its own scheme; use `https://` outside local dev |

User IDs are regenerated on restart, so old JWTs stop identifying these users after a backend restart. The seeded supplier identifier is not automatically linked to the vehicle database's supplier table. Public user fields are `id`, `name`, `email`, `role`, and optional `supplierId`; password hashes are not returned. Tokens expire after one day, or 30 days with `rememberMe: true`.

Handled auth credential errors use `{"message":"..."}`, whereas handled vehicle errors use `{"error":"..."}`. Auth bodies use Ktor request decoding; the vehicle-specific validation/error rules below should not be assumed for auth decoding failures.

Postman login example (set a local `adminPassword` variable matching the backend process setting):

```json
{
  "email": "advisor.hansen@kommune.no",
  "password": "{{adminPassword}}",
  "rememberMe": false
}
```

Postman's cookie jar retains the `auth_token` cookie from login and sends it to `/api/auth/me`; logout clears it. Do not configure a Bearer token: Authorization headers are ignored. Vehicle tests continue to use No Auth. Do not share credentials or tokens with agents.

## Certificate API

Certificate routes require the `auth_token` cookie from a real administrator login. Mock login is not accepted. The upload is `multipart/form-data` with a `supplierName` field and one `file` PDF; the server limits requests to 8 MB and 25 pages. Searchable text is extracted with PDFBox; scanned pages use Tesseract (`nor+eng`, 300 DPI), which must be installed locally for scanned documents.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/certificates` | List certificate metadata, sorted by urgency |
| POST | `/api/certificates` | Parse a PDF, save metadata, and return the new record |
| PUT | `/api/certificates/{id}` | Update supplier, type, issue/expiry dates, and optional contract reference |
| DELETE | `/api/certificates/{id}` | Permanently delete a certificate metadata record |

The update body is JSON, for example:

```json
{
  "supplierName": "Example Transport AS",
  "certificateType": "ISO 14001",
  "issueDate": "2025-01-15",
  "expiryDate": "2028-12-31",
  "contractId": "CONTRACT-42"
}
```

Dates use ISO `yyyy-MM-dd`; either date and `contractId` may be `null`. The issue date cannot be after the expiry date. The PDF itself is not stored, so changing extracted document details requires uploading the PDF again.

The original PDF is not retained. Extracted metadata is stored in a separate SQLite file beside the configured vehicle database (for example, `vehicles-certificates.db`); status is recalculated from the expiry date on each read. A missing expiry is marked `MISSING_DOCUMENTATION`; parser results must be reviewed before being used as compliance evidence. Supplier and contract records are not yet linked to this certificate list.

Generate synthetic, clearly marked PDF samples for local testing from the `backend/` directory:

```powershell
.\gradlew.bat runCertificateGenerator
.\gradlew.bat runCertificateGenerator --args="20 4290"
```

The optional arguments are sample count (1–60) and random seed; reusing a seed reproduces the same cases. PDFs are written under `backend/build/generated-certificate-samples/seed-<seed>/`. The generator tests supported certificate types, date labels/formats, validity ranges and expiry statuses, then extracts its generated PDFs and compares parsed results with known expected values. These sample files contain no real data, are visibly marked as invalid test documents, and should only be uploaded to a local development instance.

## Vehicle API

Base URL: `http://localhost:8080`. Vehicle endpoints use JSON and currently have **no backend authorization**; keep them local.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Check whether the server is running |
| GET | `/api/vehicles` | Browse vehicles and today's approval status |
| GET | `/api/vehicles/{plate}` | Read a vehicle, approval periods, statistics and latest saved check |
| GET | `/api/vehicles/{plate}/checks` | Browse saved check history |
| GET | `/api/trip-rows` | Browse statistics rows |
| POST | `/api/trip-rows` | Append statistics, then check each distinct plate |
| POST | `/api/vehicle-approvals` | Create approval-period records |
| PUT | `/api/vehicle-approvals/{approvalId}` | Edit one approval period |
| POST | `/api/vehicle-approvals/{approvalId}/revoke` | Revoke one approval period |
| POST | `/api/vehicle-checks` | Run and save a check |
| GET | `/api/vehicle-checks/{checkId}` | Read the original saved check evidence |

Lists accept `page` (default 1) and `pageSize` (1–100, default 25; history defaults to 10).
Vehicle/statistics lists also accept `search` for a partial plate. Vehicles accept `approvalStatus`:
`ACTIVE`, `NOT_YET_ACTIVE`, `EXPIRED`, `REVOKED`, `NOT_APPROVED`.
List responses contain `items`, `total`, `page` and `pageSize`. GET requests never call Statens Vegvesen or save checks.

## Shared request rules

- POST/PUT: `Content-Type: application/json`; booleans and numbers must not be quoted. Unknown fields are rejected.
- Ordinary plates have two letters and four/five digits, without a leading zero. Spaces/hyphens are removed and letters uppercased.
- Dates use `YYYY-MM-DD`, with inclusive boundaries and start ≤ end.
- Fuel, category and body style use code strings, not labels. See [VehicleCatalog.kt](src/main/kotlin/com/tdt4290group7/backend/vehicles/VehicleCatalog.kt).
- Applicable statistics fields are required. Numbers are non-negative; zero and false are explicit values, not missing data. Source precision is preserved.
- Batches contain 1–10,000 entries. One invalid entry rejects the whole batch. Neither statistics nor approval POSTs deduplicate repeated submissions.

## Statistics

`POST /api/trip-rows`. One row represents a trip/reporting period, not necessarily an individual journey.
This synthetic example contains all required fields:

~~~json
{
  "sourceName": "synthetic-statistics",
  "rows": [{
    "registrationNumber": "AB12345",
    "periodStart": "2026-01-01",
    "periodEnd": "2026-01-31",
    "fuelTechnology": "2",
    "vehicleCategory": "M1",
    "bodyType": "AA",
    "make": "Synthetic Make",
    "model": "Synthetic Model",
    "co2Registered": true,
    "co2GramsPerKm": 120,
    "medianCo2": 110,
    "totalTripKm": 1000,
    "totalKmCo2Registered": 1000,
    "totalKmCo2NotRegistered": 0,
    "kmFuelNotRegistered": 0,
    "totalKmFuelRegistered": 1000,
    "totalKmNoxRegistered": 1000,
    "totalNoxRegisteredGrams": 20,
    "averageFuelConsumptionLitresPer100Km": 8,
    "fuelConsumedLitres": 80,
    "tripCount": 3
  }]
}
~~~

`sourceName` and row `comment` are optional. Distance is km; average fuel consumption is **L/100km**; total fuel is liters; total NOx is grams.
`co2Registered` means the supplier marks the vehicle as CO₂-emitting. Median CO₂ and registered distances retain the supplier's meaning; no contractual interpretation is assumed.

For electric/hydrogen (`"5"`/`"6"`), send `co2Registered: false` and explicit null for:
`co2GramsPerKm`, `medianCo2`, `totalNoxRegisteredGrams`, `totalKmCo2Registered`, `totalKmNoxRegistered`.
Both liters fields are null/omitted for electric, hydrogen and unpowered trailers (`NOT_APPLICABLE`, categories O1–O4).
CO₂-unregistered distance and fuel distances remain required numbers.

The response includes saved `rows` and one `checks` result per distinct plate.
Read-only `estimatedCo2Kg` = distance × supplier CO₂ g/km ÷ 1000; it is null when inapplicable.
**201 means statistics were saved**, not that verification succeeded. If a check fails, retry the check, not the statistics POST.
After an ambiguous connection failure, inspect saved rows before resubmitting.

## Approval periods

`POST /api/vehicle-approvals` always creates new records, including overlapping recertification:

~~~json
{
  "sourceName": "synthetic-approvals",
  "approvals": [{
    "registrationNumber": "AB12345",
    "fuelTechnology": "2",
    "vehicleCategory": "M1",
    "startDate": "2026-01-01",
    "expiryDate": "2027-06-30"
  }]
}
~~~

Blank/null start becomes today's Oslo date; blank/null expiry means indefinite.
Compatible overlaps are allowed. Conflicting fuel/category values create a deviation.
Reporting periods must be covered without gaps; adjacent and overlapping approvals can jointly cover them.

To edit, PUT to the **approval UUID** with:
`{ "approval": { ...complete approval fields... }, "sourceName": "optional", "expectedUpdatedAt": "stored timestamp" }`.
A stale timestamp or revoked period returns 409. The plate cannot change. Clearing expiry makes it indefinite; clearing start retains its original date.

Revoke by approval UUID with POST and no body. Only that period changes.
Coverage ends from the revocation's Oslo date, preserving earlier days. Other periods and previous saved checks remain unchanged.

## Checks and deviations

POST `/api/vehicle-checks` with `{ "registrationNumber": "AB12345", "forceRefresh": false }`.
A check includes **every saved statistics row** and all approval evidence for the plate.
Today's approval is separate from historical period coverage; current registry data does not establish past registry status.

Successful registry snapshots are reused for 14 days, configurable via `SVV_CACHE_TTL_DAYS`.
`forceRefresh: true` bypasses the cache. Sources are `LIVE`, `CACHE`, `STALE_CACHE` or `UNAVAILABLE`.
Inspect `lookupOutcome`, `refreshFailure` and `fetchedAt`; HTTP success alone is not proof of verification.

| Priority | Examples |
|---|---|
| HIGH | Approval failures/conflicts, fuel/category mismatches, adverse registration status |
| MODERATE | CO₂/NOx/consumption differences, body/brand/model differences, overlapping statistics, missing/stale verification |

All findings are deviations. `findings` provides descriptions and links to affected rows, approvals and registry measurements.
`deviations` contains distinct codes; `highPriorityCount`/`moderatePriorityCount` count individual occurrences.
The frontend's **Deviations** tab shows saved facts side by side, with units and calculation inputs.

Numerical comparisons round to the nearest integer (.5 upward), without changing stored precision:
- Every relevant CO₂ measurement is compared; one mismatch still flags even if another matches.
- NOx mg/km = supplier grams × 1000 ÷ NOx-registered distance.
- Fuel L/100km = liters × 100 ÷ total distance, assuming the same reporting scope.

Different registry methods/reporting scopes may explain numerical discrepancies. Missing data is not zero.
Median CO₂, Euro-class thresholds and registered-distance sum checks are not implemented.
Usage prohibition (`bruksforbud`) remains unknown for this registry endpoint.

## Database compatibility and safe development setup

SQLite uses schema version 6, explicit columns/relationships and exact decimals.
It stores supplier observations, approval periods, selected registry fields and saved check evidence—not full registry responses.
History is retained indefinitely; cache age controls freshness, not retention.

The default native path is `backend/data/vehicles.db`. Configure `VEHICLE_DB_PATH` in root `.env`; relative paths use the server working directory.
Recognized empty version-3/4/5 databases upgrade automatically. Populated/unknown older schemas are preserved and refused.
For testing, choose a new filename rather than deleting data without approval. See [VehicleSchema.kt](src/main/kotlin/com/tdt4290group7/backend/vehicles/VehicleSchema.kt) for the exact tables.

## Testing and common errors

In Postman: choose No Auth, use **Body → raw → JSON**, and start with GET `/health`.
POST the synthetic approval/statistics examples, then run a check. Copy its top-level ID to GET the saved check.
Use approval IDs—not plates—for editing/revocation. Never send the Statens Vegvesen key through Postman.

| Status/problem | Meaning |
|---|---|
| 400 | Invalid JSON, fields, codes, dates or values |
| 404 | Requested vehicle/check/approval record not found |
| 409 | Approval changed or was revoked; reload before editing |
| 503 | SQLite is busy; retry later |
| `NOT_CONFIGURED` | No registry key configured |
| `STALE_CACHE` | Refresh failed; older registry facts are used |
| Connection refused | Backend is not running or the address is wrong |

Automated tests use synthetic data and isolated databases. Do not share confidential records, registry responses, keys or real-data logs with agents.
Logs go to the console; saved checks are database evidence, not logs.
Excel batch upload is only a disabled frontend placeholder; no file-import endpoint/parser is implemented.
