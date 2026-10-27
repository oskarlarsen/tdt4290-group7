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

## Vehicle agreements and reporting

Agreement management lives exclusively in **Vehicles**. Contracts and the general supplier dashboard keep their existing behaviour.
All vehicle endpoints require a real signed-in **ADMIN** session. Mock frontend login does not issue a backend cookie; leave `VITE_MOCK_AUTH` unset/false when working with Vehicles. The backend obtains the audit actor from that session, never the request body.

A supplier has a name and a nine-digit organization number. Each agreement has start/end dates (inclusive), a maximum number of vehicles and an optional note. It uses its supplier's name; there is no agreement name, type or case number. Vehicles have one agreement association. Planned entries reserve a place and receive a server-generated `PLAN...` identifier; they cannot be checked against SVV or receive statistics.

Capacity includes registered and planned entries. Additions are rejected at or above the allowance. Reducing the allowance below the listed count is permitted. Replacement is immediate and atomic, including when full or over the allowance. Removed/replaced vehicles keep their agreement association, statistics and history.

### Fleet endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/vehicle-fleet` | Suppliers, agreements, listed/previous vehicles and recent changes |
| POST | `/api/vehicle-fleet/suppliers` | Create `{name, orgNumber}` |
| PUT | `/api/vehicle-fleet/suppliers/{id}` | Edit `{supplier: {name, orgNumber}, expectedUpdatedAt}` |
| POST | `/api/vehicle-fleet/agreements` | Create `{supplierId, startDate, endDate, allowedVehicles, note}` |
| PUT | `/api/vehicle-fleet/agreements/{id}` | Edit `{agreement: {...}, expectedUpdatedAt}` |
| DELETE | `/api/vehicle-fleet/agreements/{id}` | Remove agreement and current list; body `{expectedUpdatedAt}` |
| POST | `/api/vehicle-fleet/agreements/{id}/vehicles` | Add `{registrationNumber}` or `{planned: true}` |
| DELETE | `/api/vehicle-fleet/vehicles/{plate}` | Remove from list; body `{expectedUpdatedAt}` |
| POST | `/api/vehicle-fleet/vehicles/{plate}/replace` | `{replacement: {registrationNumber} or {planned:true}, expectedUpdatedAt}` |
| GET | `/api/vehicle-fleet/history?page=1` | Thirty changes per page |
| POST | `/api/vehicle-fleet/history/{id}/undo` | Record a reversal of an eligible change |

Writes and their before/after records commit in one SQLite `BEGIN IMMEDIATE` transaction. The relational audit stores actor ID/name, time and previous/resulting supplier, agreement and vehicle states. Undo restores the earlier state with a new audit event; it does not erase history. Later dependent changes can make an earlier action ineligible. Undoing a removal may restore a count above a subsequently reduced allowance.

### Statistics and checks

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/trip-rows` | Append reporting rows, then check each distinct real registration number |
| GET | `/api/trip-rows?search=AB12345&page=1&pageSize=25` | Read reporting rows without calling SVV |
| GET | `/api/vehicles/{plate}` | Reporting rows, agreement evidence and latest check |
| POST | `/api/vehicle-checks` | `{registrationNumber, forceRefresh:false}` |
| GET | `/api/vehicle-checks/{id}` | Frozen historical check |
| GET | `/api/vehicles/{plate}/checks?page=1&pageSize=10` | Previous check summaries |

Registration numbers are normalized by removing spaces/hyphens and uppercasing. Real plates contain two letters and four/five digits without a leading zero. Batch statistics accept up to 10,000 rows and 4 MiB; other requests retain the 16 KiB limit. Query page sizes are 1-100. Unknown fields are rejected.

One statistics row describes a vehicle over a reporting period, not an individual journey. Reporting dates and all applicable observation fields are required. CO2 rate is g/km; estimated period CO2 is `totalTripKm * co2GramsPerKm / 1000` kg. NOx mass is grams and comparison rate is `totalNoxRegisteredGrams * 1000 / totalKmNoxRegistered` mg/km. Consumption is L/100km. Supplier numbers remain exact decimal JSON numbers stored as integer coefficient/scale. Median CO2 has been removed.

~~~json
{
  "rows": [{
    "registrationNumber": "AB12345",
    "periodStart": "2026-01-01", "periodEnd": "2026-01-31",
    "fuelTechnology": "2", "vehicleCategory": "M1", "bodyType": "AA",
    "make": "Synthetic make", "model": "Synthetic model",
    "co2Registered": true, "co2GramsPerKm": 123.456,
    "totalTripKm": 1000, "totalKmCo2Registered": 1000,
    "totalKmCo2NotRegistered": 0, "kmFuelNotRegistered": 0,
    "totalKmFuelRegistered": 1000, "totalKmNoxRegistered": 1000,
    "totalNoxRegisteredGrams": 25,
    "averageFuelConsumptionLitresPer100Km": 8,
    "fuelConsumedLitres": 80
  }]
}
~~~

Electric/hydrogen rows require `co2Registered=false` and explicit null CO2/NOx measurements and registered distances. Their litres fields are null. Unpowered trailers use `NOT_APPLICABLE` fuel; other fuel/category codes use the controlled catalogues. Missing values are never interpreted as zero. Supplier observations and SVV observations remain distinct.

Checks compare current list membership, agreement dates and supplier statistics against available SVV facts. List changes use exact timestamps in the audit trail. Vehicles have no individual approval periods. Saved checks freeze the agreement, supplier, list membership, selected statistics and registry snapshot; edits and undo never rewrite them.

Adding a registered vehicle, replacing a vehicle, or registering a planned entry requires a successful live Statens vegvesen lookup. Confirmed unknown registrations return 400; lookup outages, missing configuration, access errors, invalid responses and quota failures return 503. No vehicle-list or audit changes are committed on lookup failure, and cached success cannot bypass this requirement. Planned placeholders skip the lookup. The verified snapshot and vehicle change are saved atomically after checking membership, version and capacity again. Remote lookups never hold a database write lock.

Deviation checks cache SVV success for 14 days by default. A failed refresh keeps older data with `STALE_CACHE` and `refreshFailure`, or returns `UNAVAILABLE` without a snapshot. Registry methods remain separate and all relevant emission measurements are compared after exact whole-number rounding. Usage prohibition remains unknown. These are comparison findings, not proof of complete compliance.

Statistics shows **Vehicle data (Statens vegvesen)** once, above period-based **Reported data**. Registered CO2/NOx rates retain their measurement methods. Reported NOx is calculated in mg/km from reported grams and NOx-registered distance; zero distance does not imply a zero rate. General registry data is no longer duplicated under Deviations, while each saved finding keeps its original comparison evidence. Jobs/trips count is no longer accepted or stored.

Inspection dates are allowlisted from `periodiskKjoretoyKontroll.sistGodkjent` (last approved inspection) and `.kontrollfrist` (next inspection deadline), not from vehicle first registration, technical approval or agreement dates. Both are `format: date` in the [official Statens vegvesen OpenAPI schema](https://akfell-datautlevering.atlas.vegvesen.no/v3/api-docs), under `PeriodiskKjoretoyKontroll`. They are nullable ISO dates in storage/API and displayed as dd.mm.yyyy. Missing fields show Not available. Euro class uses `miljodata.euroKlasse`. Existing snapshots remain unchanged; use Refresh vehicle data to retrieve the new fields.

### Database reset and tests

The vehicle database is disposable development data. Startup creates the current schema (version 8) for an empty database and refuses incompatible schemas with a reset instruction. It does not migrate or silently wipe existing data. Before future schema changes, agree with the project owner whether existing data should be wiped or preserved.

For an approved reset, stop the backend and run `./scripts/reset-vehicle-data.ps1` from `backend`. This removes only `backend/data/vehicles.db` and its SQLite sidecars. A custom `.db` path inside `backend/data` can be selected using `-DatabasePath`. The next backend startup creates an empty database with the current schema.

From `backend`:

```powershell
./gradlew.bat test --console=plain
./gradlew.bat run
```

Tests use isolated files under `backend/build/test-data` and no live SVV key. User accounts and other application data are separate from this reset.
