# Vehicle backend guide

This Kotlin/Ktor service accepts JSON containing vehicle statistics and approvals, stores them in SQLite, and checks one registration number against local approval data and Statens Vegvesen.

A statistics row covers a mandatory reporting period and may represent several jobs or days, not one individual trip. Approval is separate: submitting statistics never approves a vehicle. All examples here are synthetic. Agents must not inspect confidential datasets, real vehicle responses, or logs containing them.

## Request flow

1. Submit usage statistics through `POST /api/trip-rows`.
2. Submit approved vehicles through `POST /api/vehicle-approvals`.
3. Saving statistics automatically checks each submitted plate. Use `POST /api/vehicle-checks` to recheck a vehicle or force a refresh separately.
4. The backend reads local approval/statistics, reuses a recent snapshot or calls Statens Vegvesen, then saves and returns a combined result.

There are no import IDs to pair or suppliers to select. The API accepts JSON, not PDF/spreadsheet uploads. Convert source columns into the fields below before submitting.

```mermaid
flowchart TD
    A[Frontend or Postman] --> B[POST statistics or approvals]
    B --> C[(SQLite)]
    A --> D[POST check for one plate]
    C --> D
    D --> E{Recent snapshot and no forced refresh?}
    E -- Yes --> F[Use cache]
    E -- No --> G[Backend calls Statens Vegvesen]
    F --> H[Evaluate local approval and registry status]
    G --> H
    H --> I[Save relational check evidence and return result]
```

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

## Admin vehicle-page read API

The admin frontend draft uses real vehicle endpoints even if login mocks are enabled separately. These GET requests only read SQLite: they never create vehicles, save checks or call Statens Vegvesen.

| Endpoint | Parameters / result |
|---|---|
| `GET /api/vehicles` | `search`: optional partial registration number, case/space/hyphen normalized, up to 7 letters/digits. `approvalStatus`: optional `ACTIVE`, `NOT_YET_ACTIVE`, `EXPIRED`, `REVOKED`, or `NOT_APPROVED`. `page`: positive integer, default 1. `pageSize`: 1–100, default 25. Returns `items`, `total`, `page`, `pageSize`, and `approvalAsOf`. Stable registration-number order. |
| `GET /api/vehicles/{registrationNumber}` | Returns current vehicle/approval, `approvalStatus`, `approvalAsOf`, all stored reporting rows newest first, latest selected Statens Vegvesen snapshot and latest saved check summary. Unknown plate: 404, without inserting it. |
| `GET /api/vehicles/{registrationNumber}/checks` | `page`: positive integer, default 1. `pageSize`: 1–100, default 10. Returns newest-first saved check summaries with `items`, `total`, `page`, and `pageSize`. Unknown vehicle: 404; known vehicle with no checks: empty items. |
| `GET /api/trip-rows` | `search`: optional normalized partial plate, up to 7 alphanumeric characters. `page`: positive integer, default 1. `pageSize`: 1–100, default 25. Returns `items`, `total`, `page`, `pageSize`, newest creation time first, then insertion order for ties. Repeated plates/periods stay separate. |

Malformed parameters return 400. Out-of-range pages return empty items, not an error. Approval is evaluated on the current Oslo date (including the expiry date). Each read uses a single SQLite read transaction; its totals and items share one database snapshot. The summary's approval and deviations describe the **time of that check**, whereas the overview/details approval describes **today**. `dataSource` likewise describes how Statens Vegvesen data was obtained when that check ran; use `checkedAt` and `fetchedAt` to judge age.

Use the existing `GET /api/vehicle-checks/{id}` for original check evidence. Opening the frontend, statistics rows or history does not create checks. Saving statistics automatically invokes the check service after appending; explicit Run check in vehicle details posts `/api/vehicle-checks`, with optional `forceRefresh`. The details API still returns all reporting rows for one vehicle, while the statistics directory uses the paginated global endpoint. Batch UI actions are deferred. Pagination is not a cross-request frozen snapshot if records change between pages.

These routes retain the existing unauthenticated vehicle-route policy. The frontend's admin route guard is not server-side authorization; do not expose the draft beyond local development until backend access controls are implemented.

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

## Shared request rules

Vehicle POST bodies use Content-Type: application/json. There are no query parameters; vehicle routes currently require no Authorization header.

- Unknown fields are rejected, including additionalFields, legacy aliases, and user-supplied estimatedCo2Kg.
- Text must be quoted JSON text. Booleans must be unquoted true/false. Amounts must be JSON numbers, not quoted strings. tripCount is a non-negative 32-bit integer.
- Applicable observations are required and cannot be missing/null. The five electric/hydrogen emission fields listed below require explicit JSON null keys; missing those keys is still invalid. Optional fields may be omitted/null. Missing is not zero or false.
- Amounts are non-negative exact decimals: at most 18 fractional places after removing insignificant trailing zeroes, and an unscaled integer between 0 and 9223372036854775807. Unsupported values are rejected, never rounded.
- Plates are uppercased, with whitespace/hyphens removed, then must match `^[A-Z]{2}[1-9][0-9]{3,4}$`: two letters followed by four or five digits, no leading zero. This accepts ordinary Norwegian plates only, not personal/historical/foreign formats, and validates syntax rather than registry recognition. Directory search remains partial.
- Trip rows require periodStart and periodEnd: valid YYYY-MM-DD dates with start <= end. Both boundaries are inclusive. Single-day periods are allowed.
- Batches contain 1–10,000 entries. One invalid entry rejects the entire batch. BEGIN IMMEDIATE reserves SQLite's writer before reading, waits up to five seconds for contention, and rolls back failed writes atomically.
- The normalized registration number is the vehicle primary key. Other record IDs are UUID strings. Generated timestamps are UTC with nine fractional digits. Approval is evaluated as of today in Europe/Oslo, not the statistics period.
- Optional/default response fields can be omitted. estimatedCo2Kg is always returned: a calculated number for applicable observations, or null for electric/hydrogen statistics.
- fuelTechnology always means fuel technology, but belongs to a separate supplier, approval or registry observation. Approvals and trip rows now require official code strings, not labels or broad values such as Fossil or Electric/Hydrogen. Never guess a more specific value during import.

### Classification codes and English labels

Fuel/category/body-type dropdowns display official codes alongside application-owned English labels. API inputs store the codes as JSON strings, not numbers or translated labels. Kotlin enums, TypeScript literal unions and SQLite CHECK constraints restrict submitted values. The frontend catalogue parity test ensures both clients stay aligned.

| fuelTechnology | English label | fuelTechnology | English label |
|---|---|---|---|
| `"1"` | Gasoline | `"2"` | Diesel |
| `"3"` | Kerosene | `"4"` | Gas |
| `"5"` | Electric | `"6"` | Hydrogen |
| `"7"` | Gasoline hybrid | `"8"` | Diesel hybrid |
| `"9"` | Other fuel | `"10"` | Biodiesel |
| `"11"` | Biogasoline | `"12"` | LPG |
| `"13"` | CNG | `"14"` | Methanol |
| `"21"` | LNG | | |

This is the simplified manual input subset of [Statens Vegvesen fuel codes](https://autosys-kjoretoy-api.atlas.vegvesen.no/kodeverk-ui/index-kodeverk.html?kodeverkId=DRIVSTOFFTYPE): 1–14 and 21. CNG (`13`) and LNG (`21`) are separate choices. LPG A/B (`16`/`17`) group with LPG (`12`); CNG 20/25 (`18`/`19`) group with CNG (`13`); combined CNG/LNG (`22`) represents both groups, not a separate manual option. Grouping helpers are available but no new comparison rules are enabled. The structured Statens Vegvesen observation always preserves the original code; ethanol (`15`) and compressed air (`20`) are never falsely relabelled as another fuel. Gasoline/diesel hybrids remain separate; no hybridCategory/isHybrid is retained. Codes do not establish plug-in status or fuel actually used during a period.

`vehicleCategory` replaces approval `vehicleGroup` and is required on trip rows. Submitted categories are `M1`, `M2`, `M3`, `N1`, `N2`, `N3`, `O1`, `O2`, `O3`, `O4`: passenger cars, buses, vans, trucks and trailers. G variants are merged into their base category for application grouping (`M1G` → `M1`, etc.), but original Statens Vegvesen codes remain in the structured observation. This is not the former approval sheet's 7.5-tonne grouping. See [Statens Vegvesen technical categories](https://autosys-kjoretoy-api.atlas.vegvesen.no/kodeverk-ui/index-kodeverk.html?kodeverkId=TEKNISKKODE) and `VehicleCatalog.kt` / `vehicleCatalog.ts`.

`bodyType` replaces ambiguous trip-row `vehicleType` and represents body style, not technical category: e.g. `AA` Sedan, `AB` Hatchback, `AC` Station wagon, `AD` Coupe, `AE` Convertible. The complete [Statens Vegvesen body-type catalogue](https://autosys-kjoretoy-api.atlas.vegvesen.no/kodeverk-ui/index-kodeverk.html?kodeverkId=KAROSSERITYPE) is supported, including bus/truck/trailer bodies. Do not automatically reinterpret an old spreadsheet's Biltype text as a code without verifying its meaning. Body type is not an approval requirement in this version.

Unpowered trailers (`O1`–`O4`) must use `fuelTechnology: "NOT_APPLICABLE"`. This is an **application-only sentinel**, not an official Statens Vegvesen code and not the same as Other fuel (`"9"`). It is invalid for non-trailer categories. No engine-powered trailer exception is represented in this version. Both litres fields must be omitted/null for electric (`"5"`), hydrogen (`"6"`) and unpowered trailers. They are required for other submitted fuels, including both hybrids. The API has no kg/kWh/m³ consumption inputs; do not convert those quantities into litres by relabelling them.

Electric/hydrogen statistics must use `co2Registered: false` and explicit `null` for `co2GramsPerKm`, `medianCo2`, `totalNoxRegisteredGrams`, `totalKmCo2Registered` and `totalKmNoxRegistered`. The UI shows **Not applicable** for these locked fields; API and SQL reject numeric values, including zero. This is an agreed reporting applicability rule, not a universal assertion about hydrogen powertrains or lifecycle emissions. CO₂-unregistered distance and both fuel-registered/unregistered distances remain editable and mandatory. Other fuels require numeric emission observations, including explicit zero when appropriate; NOx warning rules are deferred.

## Routes and HTTP statuses

| Method and route | Purpose | Success |
|---|---|---|
| GET /health | Liveness: {"status":"UP"} | 200 |
| GET / | Text greeting | 200 |
| GET /api/trip-rows | Browse reporting-period statistics | 200 |
| POST /api/trip-rows | Append reporting-period statistics, then check distinct plates | 201 |
| POST /api/vehicle-approvals | Add/replace submitted approvals | 201 |
| POST /api/vehicle-approvals/{registrationNumber}/revoke | Revoke one approval | 200 |
| POST /api/vehicle-checks | Save a check for one plate | 201 |
| GET /api/vehicle-checks/{id} | Retrieve original saved evidence | 200 |

Malformed JSON, unknown fields, wrong types and invalid values return 400 with an error object. Missing saved checks/unrevoked approvals return 404. SQLite contention returns 503 with {"error":"Vehicle database is busy; try again later"}. Other unhandled errors return 500 with "Internal server error".

An Statens Vegvesen failure does not prevent saving a check: POST still returns 201. Inspect registry lookup metadata, not just HTTP status. Health does not verify Statens Vegvesen configuration/connectivity.

## Append statistics

POST /api/trip-rows, Body → raw → JSON:

~~~json
{
  "sourceName": "synthetic-trip-sheet",
  "rows": [
    {
      "registrationNumber": "AB 12345",
      "periodStart": "2026-01-01",
      "periodEnd": "2026-01-31",
      "fuelTechnology": "2",
      "vehicleCategory": "M1",
      "bodyType": "AC",
      "make": "Synthetic Make",
      "model": "Synthetic Model",
      "co2Registered": true,
      "co2GramsPerKm": 123.456,
      "medianCo2": 120.25,
      "totalTripKm": 1000,
      "totalKmCo2Registered": 1000,
      "totalKmCo2NotRegistered": 0,
      "kmFuelNotRegistered": 0,
      "totalKmFuelRegistered": 1000,
      "totalKmNoxRegistered": 1000,
      "totalNoxRegisteredGrams": 25.67,
      "averageFuelConsumptionLitresPer100Km": 8,
      "fuelConsumedLitres": 80,
      "tripCount": 3
    }
  ]
}
~~~

| Field | JSON type | Meaning |
|---|---|---|
| registrationNumber | Required string | Regnr / Registreringsnr. |
| periodStart, periodEnd | Required date strings | Reporting-period boundaries; not individual journey dates |
| fuelTechnology | Required code string | Supplier-reported fuel; official code, or trailer-only NOT_APPLICABLE |
| vehicleCategory | Required code string | Supplier-reported Statens Vegvesen technical category |
| bodyType | Required code string | Supplier-reported body style; distinct from technical category |
| make, model | Required non-blank strings | Supplier make/model |
| co2Registered | Required boolean | Supplier marks the vehicle as CO₂-emitting; false must be explicit |
| co2GramsPerKm | Required number or explicit null | Supplier emission rate, g/km; null only for electric/hydrogen |
| medianCo2 | Required number or explicit null | Stored source value; meaning/unit are not inferred; null only for electric/hydrogen |
| totalTripKm | Required number | Unified distance, km; includes former km per buss |
| totalKmCo2Registered, totalKmCo2NotRegistered | Required keys | Supplier CO₂-registered/unregistered distances, km. Registered distance is null only for electric/hydrogen; unregistered distance remains numeric |
| kmFuelNotRegistered, totalKmFuelRegistered | Required numbers | Supplier fuel-unregistered/registered distances, km |
| totalKmNoxRegistered | Required number or explicit null | Supplier NOx-registered distance, km; null only for electric/hydrogen |
| totalNoxRegisteredGrams | Required number or explicit null | Supplier NOx total, grams; numeric zero accepted for applicable fuels, null for electric/hydrogen |
| tripCount | Required integer | Job/trip count; zero is accepted |
| averageFuelConsumptionLitresPer100Km | Conditionally required number | Average fuel consumption, L/100km. Must be omitted/null for codes 5, 6 or NOT_APPLICABLE |
| fuelConsumedLitres | Conditionally required number | Total litres; same applicability rule as average consumption |
| comment | Optional string | Supplier comment |

All applicable statistics fields above are mandatory; comments/references and inapplicable litres are optional. `sourceName` is an optional batch reference, not an import ID or supplier identifier. `assignmentNumber` was removed; use sourceName/comment for contextual references. Trip rows have no approval flag. Numeric zero and boolean false remain explicit values, distinct from not-applicable nulls. Missing measurements are not inferred from Statens Vegvesen or defaulted by the UI. Registered distances retain the supplier's reporting meaning: no contractual or coverage interpretation is assumed. The exact meaning of Median CO₂ still needs client clarification. The old `averageConsumptionLitresPerKm` field is rejected: for example, 0.08 L/km must now be submitted as 8 L/100km under the new field name.

Response: `createdAt`, `rowCount`, `distinctVehicleCount`, `rows`, `checks`. Stored rows contain id, registrationNumber, optional sourceName, createdAt, data and read-only estimatedCo2Kg. Stored plates are normalized. Repeated submissions append more rows, including identical/overlapping periods. No deduplication or summation occurs. The global statistics list sorts creation time then insertion order; the existing per-vehicle details view sorts creation time then UUID.

After the batch transaction commits, the backend invokes the check service **once per distinct normalized plate**, with `forceRefresh=false`. This uses current approval as of today and the configurable 14-day Statens Vegvesen cache, just like a manual check. The check captures all rows present for that plate, including earlier rows. `checks` contains one `{registrationNumber, check}` result per plate, where `check` is the saved historical summary (`id`, `checkedAt`, `approvalStatus`, registry source/outcome and deviations). Ordinary Statens Vegvesen failures still save an incomplete check. Unexpected checking/storage failures instead return `{registrationNumber, error}` with a safe retry message. HTTP 201 means statistics were saved, not that Statens Vegvesen verification passed. Retry verification through `/api/vehicle-checks`; **do not resubmit statistics** to retry a check. Append and checks are not one atomic transaction: if the client disconnects/cancels after persistence, inspect rows and check history before taking further action. Large batches may wait for several sequential external lookups; there is no background job or new batch UI in this version.

### Total CO₂ (calculated estimate, kg)

estimatedCo2Kg = supplier totalTripKm × supplier co2GramsPerKm / 1000.

The example row returns 123.456 kg in `estimatedCo2Kg`. The statistics form displays this as **Total CO₂ (kg, calculated)** in a read-only preview; users cannot submit or override it. Exact decimal arithmetic is used. The result is computed from explicit columns, not independently editable or redundantly stored. For electric/hydrogen, the supplier rate and calculated estimate are null and the UI displays Not applicable. Otherwise `co2Registered=false` alone does not supply a zero rate. Statens Vegvesen values are not substituted. This is a nominal supplier-based estimate, not measured actual or lifecycle emissions. Estimates may have more precision than individual inputs.

The supplier NOx mass and distance are related, but no NOx-rate calculation, zero-NOx warning or comparison is implemented. A zero value is stored without generating a new issue. Supplier grams and Statens Vegvesen mg/km are different quantities.

## Add or replace approvals

POST /api/vehicle-approvals:

~~~json
{
  "sourceName": "synthetic-approved-sheet",
  "approvals": [
    {
      "registrationNumber": "AB12345",
      "fuelTechnology": "2",
      "vehicleCategory": "M1",
      "startDate": "2026-01-01",
      "expiryDate": "2026-12-31"
    }
  ]
}
~~~

registrationNumber, fuelTechnology and vehicleCategory are required. Other row fields and sourceName are optional. The former usedThroughoutPeriod flag is removed and rejected. Dates must be YYYY-MM-DD. Missing startDate means immediately effective; missing expiryDate means indefinite until revoked. Expiry equal to today is active. No bodyType is required for approval. Trailer fuel applicability is enforced just as for trip rows.

At most one unrevoked approval exists per plate. Submitting creates one if absent, otherwise fully replaces its submitted fields, including future/expired records. Omitted optional fields are cleared. Omitted vehicles are untouched. Repeated plates are processed in order, with the final entry winning. approvalCount counts entries, not distinct vehicles.

Response: updatedAt, approvalCount, approvals. Stored records have id, registrationNumber, optional sourceName, createdAt, updatedAt, optional revokedAt and data. Ordinary approval edits do not create versions; checks freeze the original evaluated details.

### Approval evaluation

| Situation as of today in Europe/Oslo | approvalStatus | Deviation |
|---|---|---|
| No record | NOT_APPROVED | NOT_ON_APPROVED_LIST |
| Revoked | REVOKED | APPROVAL_REVOKED |
| Future start | NOT_YET_ACTIVE | APPROVAL_NOT_YET_ACTIVE |
| Expiry before today | EXPIRED | APPROVAL_EXPIRED |
| Otherwise | ACTIVE | None |

Statistics period dates do not change these rules or establish a past registry state.

### Revoke manually

POST /api/vehicle-approvals/AB12345/revoke, no body. Returns the revoked record (200), or 404 if no unrevoked approval exists. Reapproval creates a new ID, retaining the revoked record.

## Check one vehicle

POST /api/vehicle-checks:

~~~json
{ "registrationNumber": "AB12345", "forceRefresh": false }
~~~

registrationNumber is required. forceRefresh is an optional boolean, default false. Unknown plates are created with supplierId=null and no approval; no statistics import is required.

| Response field | Meaning |
|---|---|
| id, checkedAt | Historical check ID and time |
| vehicle | registrationNumber, optional supplierId, createdAt; no surrogate vehicle ID |
| approvalStatus, approval | Status and approval evidence evaluated at check time |
| tripRows | Statistics included at the time, with individual estimates |
| registry | Selected Statens Vegvesen facts and lookup metadata |
| deviations | Combined approval and registration findings |

### Selected registry data

registry includes dataSource, lookupOutcome, optional fetchedAt/registrationStatus/data/snapshotId/refreshFailure, usageProhibitionState and registry deviations.

registry.data is a typed object, not raw JSON or the old generic tree:

~~~json
{
  "registrationNumber": "AB12345",
  "registrationStatus": "REGISTRERT",
  "make": "Synthetic Make",
  "model": "Synthetic Model",
  "vehicleCategory": { "code": "M1", "name": "Passenger car" },
  "bodyType": { "code": "AC", "name": "Station wagon" },
  "euroClass": { "code": "6", "name": "Euro 6" },
  "fuels": [
    {
      "fuelTechnology": { "code": "2", "name": "Diesel" },
      "measurements": [
        {
          "measurementMethod": { "code": "WLTP" },
          "co2GramsPerKm": 123.456789,
          "noxMgPerKm": 12.34567
        }
      ]
    }
  ]
}
~~~

Whitelist: registration identity/status, make/model, vehicle category, body type, Euro class, fuel code/name, measurement method code/name, combined-driving CO₂ g/km and NOx mg/km. Detailed hybrid category is discarded. Missing Statens Vegvesen values remain unknown, never zero, even though supplier entry is mandatory. Known fuel/category/body codes use application-owned English labels; unknown codes are preserved without importing untranslated names. Multiple measurements retain their fuel/method association; no preferred measurement is selected. Multiple make/model names are joined with "; ".

Technical data is projected from godkjenning.tekniskGodkjenning.tekniskeData; body type comes from karosseriOgLasteplan.karosseritype. Environmental fuel groups carry forbrukOgUtslipp measurements. Engine fuel codes absent from environmental groups are included without invented measurements; grouping matches code equality only. kjoretoyId.kjennemerke must match the requested plate. No live Statens Vegvesen records are needed for synthetic projection tests.

Unselected fields are discarded before persistence or response construction. Raw HTTP bodies are transient, never logged/saved. VIN, inspection/first-registration dates, filter/particle details, registered fuel consumption, electric consumption/range, weight, seats, noise and administrative/mechanical details are not retained.

No fuel/CO₂/NOx/Euro comparison rules are implemented yet. Differing supplier/Statens Vegvesen CO₂ is the agreed future deviation rule; measurement selection/comparison remain deferred. Empty deviations do not prove complete verification. Enkeltoppslag cannot establish bruksforbud; usageProhibitionState remains UNKNOWN.

### Cache and fallback

SVV_CACHE_TTL_DAYS defaults to 14. Age equal to TTL is fresh; future timestamps are not fresh. Reuse never changes fetchedAt.

| Situation | Result |
|---|---|
| Fresh snapshot and forceRefresh=false | CACHE; no external request |
| No fresh snapshot or forceRefresh=true | Attempt backend-to-Statens Vegvesen request |
| Successful lookup | LIVE; new immutable selected-field snapshot |
| Failed lookup with previous success | STALE_CACHE, plus refreshFailure |
| Failed lookup without previous success | UNAVAILABLE, with lookupOutcome |

All failed-refresh outcomes, including NOT_FOUND/ACCESS_DENIED, follow this fallback. Forced refresh attempts a request; it does not guarantee fresh data on failure. Failed responses are never cached. Stale fallback has no maximum age. Freshness and indefinite history retention are independent.

### External lookup and outcomes

The backend requests GET https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata?kjennemerke=<plate> with the official `SVV-Authorization: Apikey <private-key>` header. Internal configuration/header names retain SVV; user-facing labels say Statens Vegvesen. Connection timeout: 10 seconds; request timeout: 20 seconds. Frontend/Postman neither supplies nor receives this key.

| Statens Vegvesen response | lookupOutcome |
|---|---|
| 200, one matching vehicle with valid selected fields | FOUND |
| Empty vehicle list or 404 | NOT_FOUND |
| 401/403 | ACCESS_DENIED |
| 422/429 | QUOTA_EXHAUSTED |
| 500/502/503/504 or network failure | TEMPORARILY_UNAVAILABLE |
| Malformed/unexpected data, wrong plate, invalid selected number, multiple vehicles, other status | INVALID_RESPONSE |
| Backend has no configured client | NOT_CONFIGURED |

Registration codes REGISTRERT/AVREGISTRERT/UTFORT/VRAKET/UREGISTRERT produce respectively no finding/DEREGISTERED/EXPORTED/SCRAPPED/UNREGISTERED. Missing/other codes in a successful snapshot produce UNKNOWN_REGISTRATION_STATUS. Failed uncached lookups do not fabricate registration findings.

## Read a saved check

GET /api/vehicle-checks/<check-id> uses the check's top-level UUID, not the plate. It returns original evidence without calling Statens Vegvesen or reevaluating approval. Later approval replacement/revocation, statistics imports or registry refreshes do not modify it. Unknown IDs return 404.

## Relational database and history

Schema version 5 uses SQLite STRICT tables, foreign keys on each connection, explicit columns, constrained classification codes/booleans/statuses, mandatory applicable statistics, validated dates and exact quantities. There are no data_json columns or arbitrary attribute maps. Coefficient/scale pairs are NOT NULL for unconditionally required measurements; conditionally applicable fields use paired nulls. CHECK constraints enforce null litres for electric/hydrogen/trailer rows, present litres for other fuels, and null electric/hydrogen CO₂/NOx measurements and registered distances with a false CO₂-emitting flag. For other fuels those five emission fields must be numeric. These constraints also apply to direct SQL inserts. Removed assignment/whole-period flags have no columns, including in frozen check evidence.

| Table | Purpose |
|---|---|
| suppliers | Reserved identity/name; no supplier-management API |
| vehicles | registration_number primary key, nullable supplier_id FK, created_at |
| trip_rows | Vehicle FK, required period, explicit supplier statistics |
| vehicle_approvals | Vehicle FK, approval observations, dates and revocation |
| svv_snapshots | Vehicle FK, fetch metadata and selected Statens Vegvesen identity/status/classification |
| svv_snapshot_fuels | Snapshot FK, fuel_index and fuel technology code/name |
| svv_emission_measurements | Composite fuel FK, measurement_index, method, CO₂ and NOx |
| vehicle_checks | Vehicle/approval/snapshot FKs, result metadata and frozen approval/vehicle evidence |
| vehicle_check_trip_rows | Check-to-statistics links, vehicle consistency and original response order |
| vehicle_check_deviations | Check FK, finding code, origin and response order |

~~~mermaid
erDiagram
    SUPPLIERS o|--o{ VEHICLES : supplies
    VEHICLES ||--o{ TRIP_ROWS : reports
    VEHICLES ||--o{ VEHICLE_APPROVALS : approves
    VEHICLES ||--o{ SVV_SNAPSHOTS : looked_up
    SVV_SNAPSHOTS ||--o{ SVV_SNAPSHOT_FUELS : contains
    SVV_SNAPSHOT_FUELS ||--o{ SVV_EMISSION_MEASUREMENTS : measured
    VEHICLES ||--o{ VEHICLE_CHECKS : checked
    VEHICLE_APPROVALS o|--o{ VEHICLE_CHECKS : evaluated
    SVV_SNAPSHOTS o|--o{ VEHICLE_CHECKS : used
    VEHICLE_CHECKS ||--o{ VEHICLE_CHECK_TRIP_ROWS : includes
    TRIP_ROWS ||--o{ VEHICLE_CHECK_TRIP_ROWS : referenced
    VEHICLE_CHECKS ||--o{ VEHICLE_CHECK_DEVIATIONS : found
~~~

registration_number and fuel_technology have consistent meanings/names, while observations remain source-specific. Composite foreign keys prevent a check from linking another vehicle's approval, snapshot or statistics.

Each numeric quantity has <name>_unscaled and <name>_scale INTEGER columns. Value = unscaled × 10^(-scale): 123.456 becomes 123456 and 3. Both must be null together or present together. Insignificant zeroes/exponent notation may be canonicalized; numerical value is exact. JSON numbers are decoded into BigDecimal without Double conversion.

History shares immutable snapshots/statistics. Named approval_* columns deliberately freeze the evaluated approval because the current record can change. Supplier/creation metadata is also frozen for original retrieval. Supporting tables preserve membership/order and the origin of findings. UPDATE triggers protect historical tables; referenced deletions are blocked by foreign keys. Complete field/constraint definitions are in VehicleSchema.kt; tripDecimalColumns lists the supplier quantity columns.

History is retained indefinitely by explicit product decision. There is no 90-day window, automatic cleanup or deletion/retention API. Cache TTL controls refreshes, not deletion. Growth/pagination and final privacy, access-control and deletion requirements remain future work, not a claim of complete GDPR compliance.

### Database compatibility and safe development setup

Schema version 5 changes average fuel consumption to L/100km, removes assignment/whole-period flags and stores inapplicable electric/hydrogen observations as null. A recognized version-3/4 database is rebuilt inside a transaction **only if all ten tables are empty**, including suppliers. The guard checks table names and record existence without loading vehicle observations. Populated version-3/4 databases, unexpected tables, version 2 and older schemas are refused without resetting data or guessing missing values. An unversioned database must be empty. A reviewed migration of populated data remains a separate decision.

For native local testing, restart the backend; an empty version-3/4 database upgrades automatically. If the compatibility guard refuses the database, choose an **unused** filename. Set `VEHICLE_DB_PATH=data/vehicles-v5.db` in your private root `.env`, or temporarily override it from `backend/`:

~~~powershell
$env:VEHICLE_DB_PATH = "data/vehicles-v5.db"
.\gradlew.bat run
~~~

The relative path is resolved against the process working directory. Startup creates a new empty database; the old file and its journal/WAL files remain untouched. A process override is not persistent: use root `.env` for later restarts, or remove the override to return to file configuration. Do not delete databases or Docker volumes without checking their contents and obtaining explicit authorization. Docker retains its configured `/app/data/vehicles.db` path; an old-volume database also needs a separately agreed migration or non-destructive new storage setup.

Clients must use code strings for fuelTechnology and vehicleCategory in both approvals/statistics, bodyType in statistics, and all required numeric/boolean observations. Use nullable inapplicable litres and explicit null emission fields as documented above. Average fuel consumption uses averageFuelConsumptionLitresPer100Km (L/100km). Removed assignmentNumber/usedThroughoutPeriod and old per-kilometre consumption fields are rejected, as are vehicleType/vehicleGroup, fuel/kmPerBus/fuelConsumptionLitresPerBus/additionalFields aliases, broad fuel labels and quoted quantities. Historical records cannot be automatically upgraded by inventing measurements or classifications.


## Logging

Logback writes INFO logs to the console: timestamp, thread, level, logger, message. No rotating file logs, central logging, or automated log retention is configured.

Application events record counts, approval/check IDs, registry origin, and deviation counts. They do not intentionally log payloads, keys, or complete Statens Vegvesen responses. Ktor also logs HTTP calls; the revocation path can contain a plate. Unhandled exceptions include stack traces and may contain identifiers. Treat console output as potentially confidential and do not share real-data logs with agents.

Saved checks/snapshots are database records, not console logs. They do not identify the user performing a vehicle action because vehicle routes are not connected to authentication.

## Postman walkthrough

Use synthetic local records. Real Statens Vegvesen testing must be performed by an authorized developer without sharing records/responses with agents.

1. Start the backend from `backend/` with `.\gradlew.bat run`.
2. Use the Postman desktop app, or its web app with Desktop Agent.
3. Click **Environments** in the sidebar, create `Local Backend`, and add the values below.
4. Save and select it in the upper-right environment dropdown.

| Variable | Local/current value |
|---|---|
| `baseUrl` | `http://127.0.0.1:8080` |
| `plate` | `AB12345` (synthetic) |
| `checkId` | Empty initially |

If both initial/current values appear, use current values for local requests. Variables belong under **Environments**, not **Params**. `{{baseUrl}}` substitutes the saved address. Postman variables do not set server settings.

Create a collection named `Vehicle Backend`. Save each request there. For POST JSON, select **Body → raw → JSON**, paste the body, then **Send**. Use **No Auth**. Never put the Statens Vegvesen key in Postman.

### Test sequence

1. GET `{{baseUrl}}/health`: expect 200 and `{"status":"UP"}`.
2. POST `{{baseUrl}}/api/trip-rows`: use the statistics example, replacing example plates with `{{plate}}`. Expect 201, two rows, one distinct vehicle.
3. POST `{{baseUrl}}/api/vehicle-approvals`: use the approval example with `{{plate}}`. Expect 201.
4. POST `{{baseUrl}}/api/vehicle-checks` with:

```json
{ "registrationNumber": "{{plate}}", "forceRefresh": false }
```

Expect 201 and `ACTIVE`. Without a key/snapshot, expect `UNAVAILABLE`/`NOT_CONFIGURED`. A synthetic plate is not expected to produce a successful real Statens Vegvesen result.

5. Copy top-level `id` into environment variable `checkId` and save.
6. GET `{{baseUrl}}/api/vehicle-checks/{{checkId}}`: expect 200 and the original result.
7. Repeat POST check: after a successful Statens Vegvesen lookup, expect `CACHE`. Failed uncached lookups do not establish a cache.
8. Set `forceRefresh` to true: expect `LIVE` on success, or the documented failure/fallback.
9. POST `{{baseUrl}}/api/vehicle-approvals/{{plate}}/revoke` with no body: expect 200.
10. Repeat POST check: expect `REVOKED` and `APPROVAL_REVOKED`.
11. Submit approval again: expect a new approval ID and `ACTIVE` on the next check.

Statistics repeats append. Approval repeats replace the unrevoked record. Old saved checks remain unchanged.

### Optional script

On a POST check, open **Scripts → Post-response**, or **Tests** in older versions:

```javascript
pm.test("A check was created", function () {
    pm.response.to.have.status(201);
    const body = pm.response.json();
    pm.expect(body.id).to.be.a("string");
    pm.environment.set("checkId", body.id);
});
```

This stores the ID automatically. See **Test Results** after sending. Passing HTTP status alone does not prove Statens Vegvesen success.

### Troubleshooting

| Symptom | Check |
|---|---|
| `ECONNREFUSED` | Server running, correct port, local agent selected |
| Unresolved `{{baseUrl}}` | Environment saved/selected, name correct |
| Invalid JSON 400 | Raw JSON, field names/types correct, no unsupported fields |
| `NOT_CONFIGURED` | Configure key locally and restart |
| `ACCESS_DENIED` | Statens Vegvesen rejected backend credentials |
| `NOT_FOUND` | Synthetic/unknown plate; separate from local approval |
| `STALE_CACHE` | Inspect `refreshFailure` and `fetchedAt` |
| Saved-check 404 | Correct check ID, same server/database |
| Frontend CORS error | Configure frontend host/port and restart |

## Current boundaries

Vehicles, statistics rows and per-vehicle check history can be listed through the documented read endpoints. Saving a statistics batch checks its distinct plates, but there is no separate batch-check UI/endpoint, background monitoring, supplier assignment, statistics deletion, spreadsheet parsing, new fuel/CO₂ policy comparisons or automatic cleanup. These describe current behavior, not promised future features.
