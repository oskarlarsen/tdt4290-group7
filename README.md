# TDT4290 Group 7 — Environmental Monitoring & Contract Compliance

TDT4290 project with a React/TypeScript frontend and a Kotlin/Ktor backend. The backend stores vehicle statistics and approvals, checks registrations against Statens Vegvesen, and parses environmental certificate PDFs.

## Repository layout

- `frontend/`: React + TypeScript + Vite dashboard.
- `backend/`: Ktor HTTP API, SQLite storage, and Statens Vegvesen integration.

See the [vehicle API guide](backend/README.md#vehicle-api) for endpoints, JSON examples and check behavior.

The admin vehicle page at `/admin/vehicles` supports statistics, approval periods, saved checks and deviation analysis. `/admin/certificates` accepts PDF uploads and shows parsed certificate expiry status. See the [frontend guide](frontend/README.md). Excel batch upload remains a disabled placeholder.

## Shared local configuration

Use one **root `.env`** for Gradle, Vite and Docker Compose. `.env.example` is the only shared template; it contains no credentials. If root `.env` does not exist, copy it once from the repository root:

```powershell
Copy-Item .env.example .env
```

Do not overwrite a configured file. Fill `JWT_SECRET`, `SEED_ADMIN_PASSWORD` and `SEED_SUPPLIER_PASSWORD` privately before starting the backend; optionally set `SVV_API_KEY`. These values persist between restarts. Use literal, single-line values; single-quote secrets containing `$` or `#`. Do not use `${OTHER_VARIABLE}` references: the standalone backend does not expand them.

For an existing checkout with `backend/.env` or `frontend/.env`, run this instead of copying the template:

```powershell
.\scripts\Migrate-LocalEnv.ps1
```

The migration preserves saved values, stops on conflicting duplicate keys and moves originals to Git-ignored `.env-backups/`. Missing authentication settings remain blank for you to fill. Backups contain secrets: keep them private and remove them yourself once verified. Retired per-service files are no longer read.

Explicit process environment values take precedence over the root file, including blank values. A blank `SVV_API_KEY` in the process disables live requests even if the file contains a key; blank required authentication settings prevent startup. Remove stale session overrides if you want the saved file value. Restart the backend/Vite after changes; rebuild the frontend Docker image after changing `VITE_` settings.

Only `VITE_` settings are exposed to browser code. Never give backend secrets that prefix. Avoid mode-specific `.env.local`/`.env.development` variants for this shared setup: Vite supports them, but the backend reads only root `.env`. Compose passes backend settings only to the backend and public frontend build arguments only to the frontend; it does not copy the root file into either image. Production deployments should inject secrets through their secret manager rather than shipping a development `.env`.

## Frontend setup

From the repository root in PowerShell:

```powershell
cd frontend
npm ci
npm run dev
```

Configure root `.env` first. Other commands: `npm run build`, `npm test -- --run`, and `npm run preview`.

The example frontend configuration uses real backend login and points at `http://localhost:8080/api`; unfinished prototype data pages still use mocks. `VITE_USE_MOCK_AUTH=true` switches login to the mock accounts, while `VITE_USE_MOCKS=true` keeps prototype data mocked. Vehicle and certificate pages always use the backend. The backend permits the Vite origin `http://localhost:5173` by default. Authentication routes use cookies; see the backend guide for vehicle and certificate APIs.

## Backend setup

Install JDK 21. From the repository root:

```powershell
cd backend
.\gradlew.bat test
.\gradlew.bat run
```

The backend discovers root `.env` automatically when launched from `backend/` or the repository root. No repeated PowerShell credential assignments are needed. Tests use isolated synthetic configuration and do not read your saved Statens Vegvesen key or database path. Keep the server terminal open. In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
```

Expected response: `{"status":"UP"}`. Stop with `Ctrl+C`.

The backend runs without a Statens Vegvesen key: local data remains usable, but a registry lookup without a usable snapshot reports `NOT_CONFIGURED`. SQLite is created automatically at `backend/data/vehicles.db` when running from `backend/`.

Vehicle storage uses SQLite with explicit relationships and selected registry fields. Checks cover every saved reporting row, approval periods and registry comparisons, with high/moderate deviations. History is retained indefinitely; the default 14-day cache controls freshness only. See the [API guide](backend/README.md#vehicle-api) and [database setup](backend/README.md#database-compatibility-and-safe-development-setup).

## Local data and credentials

Keep the Statens Vegvesen key and authentication secrets in ignored root `.env`, never in browser-visible `VITE_` settings or vehicle request bodies. Keep confidential datasets, real vehicle responses, logs containing them, and databases local. Agents must not inspect them. Shared examples must use synthetic data.

The backend includes cookie-based JWT authentication and clears the cookie on logout. Certificate endpoints require an authenticated administrator; vehicle endpoints remain unauthenticated and local-only. The default host and Compose's published backend port are bound to loopback for local development. Implement vehicle authorization before deploying or exposing the backend to other machines.

## Run the full stack with Docker

From the repository root:

```powershell
# Configure the existing root .env first.
docker compose up --build
```

Compose requires the three authentication values from the same root `.env` used for native development. Docker is optional; running Vite and Gradle directly is supported. `API_ORIGIN` controls the frontend container's Content-Security-Policy and must match the origin of `VITE_API_BASE_URL`. `HOST`, `PORT`, `VEHICLE_DB_PATH` and host-specific `TESSERACT_PATH` overrides in the template are standalone-only; containers retain their listen address/port and persistent volume.

Known existing build blocker: `backend/Dockerfile` currently has a malformed Gradle command (`./gradlewhttps://...`). That unrelated line must be corrected before a full Compose image build can succeed; configuration centralization does not fix it.

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`

Compose retains SQLite in the `vehicle-backend-data` named volume. Authentication demo users are in memory and recreated on restart, unlike vehicle data. See [authentication](backend/README.md#authentication) for endpoints and account configuration.

## Frontend environment variables

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL for the real backend API (normally `http://localhost:8080/api`) |
| `VITE_USE_MOCKS` | Enables prototype data mocks; does not mock the admin vehicle or certificate pages |
| `VITE_USE_MOCK_AUTH` | Enables mock login; defaults to real backend authentication |

Set `VITE_USE_MOCKS=true` in root `.env` to explore existing prototype data without the
backend. Vehicle and certificate pages still require the backend. Set `VITE_USE_MOCK_AUTH=true`
to use mock login. See [Mock data architecture](#mock-data-architecture)
below for how the prototype mock layers are structured.

## Test accounts (mock login)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@kommune.no` | `admin123` |
| Supplier | `supplier@leverandor.no` | `supplier123` |

## Tech stack

- **React 18 + TypeScript + Vite**
- **React Router v6** — role-based routing (`/admin/*`, `/supplier/*`), protected routes
- **TanStack Query** — server state, caching, and mutations (including for mock data — see below)
- **Tailwind CSS** — custom "Nordic Municipal Compliance" design system (see below)
- **lucide-react** — icons

## Design system

Custom Tailwind theme in `tailwind.config.ts`:

- **Colors:** `primary` (dark green, brand/buttons), `secondary` (mid green, links/accents),
  `tertiary` (light green, success/compliant states), `neutral` (blue-slate, body text/UI chrome)
  — each a full 50–950 shade scale, not single hex values.
- **Type:** `font-headline` (Geist, page titles), `font-body` (Inter, default body text),
  `font-mono` (JetBrains Mono, field labels and data-dense UI) — loaded via Google Fonts in `index.html`.

## Project Structure

```text
src/
├── App.tsx
├── main.tsx
├── vite-env.d.ts
│
├── api/                         # API layer for backend/mock requests
│   ├── alerts.ts
│   ├── auth.ts
│   ├── certificates.ts
│   ├── client.ts
│   ├── contracts.ts
│   ├── dashboard.ts
│   ├── energy.ts
│   ├── notifications.ts
│   ├── risk.ts
│   ├── suppliers.ts
│   └── vehicles.ts
│
├── app/                         # Application routing, layouts and route protection
│   ├── AdminLayout.tsx
│   ├── ProtectedRoute.tsx
│   ├── RoleRedirect.tsx
│   ├── router.tsx
│   └── SupplierLayout.tsx
│
├── components/                  # Reusable UI and feature components
│   ├── alerts/
│   │   ├── AlertActions.tsx
│   │   └── AlertCard.tsx
│   │
│   ├── certificates/
│   │   └── CertificateTable.tsx
│   │
│   ├── charts/
│   │   ├── FuelMixDonut.tsx
│   │   ├── ProgressBar.tsx
│   │   └── TrendLineChart.tsx
│   │
│   ├── risk/
│   │   ├── RiskClassificationBar.tsx
│   │   ├── RiskFactorsList.tsx
│   │   └── RiskRankedTable.tsx
│   │
│   ├── suppliers/
│   │   └── TopRiskSuppliersTable.tsx
│   │
│   ├── ui/
│   │   ├── DataTable.tsx
│   │   ├── ExportButton.tsx
│   │   ├── FilterSidebar.tsx
│   │   ├── KpiCard.tsx
│   │   ├── NotificationBell.tsx
│   │   ├── ProfileMenu.tsx
│   │   ├── QuickActions.tsx
│   │   ├── RiskBadge.tsx
│   │   ├── SearchSuppliers.tsx
│   │   ├── StatusBadge.tsx
│   │   └── TopBar.tsx
│   │
│   └── vehicles/
│       └── VehicleTable.tsx
│
├── context/                     # Global React context
│   └── AuthContext.tsx
│
├── hooks/                       # Reusable React hooks for data and application logic
│   ├── useAlerts.ts
│   ├── useAuth.ts
│   ├── useCertificates.ts
│   ├── useContracts.ts
│   ├── useDashboardSummary.ts
│   ├── useEnergy.ts
│   ├── useNotifications.ts
│   ├── useRisk.ts
│   ├── useSuppliers.ts
│   └── useVehicles.ts
│
├── mocks/                       # Mock data and mock request handlers
│   ├── authMock.ts
│   ├── db.ts
│   ├── handlers.ts
│   └── fixtures/
│       ├── certificates.json
│       ├── risk.json
│       └── vehicles.json
│
├── pages/                       # Application pages organized by user role
│   ├── admin/
│   │   ├── Alerts.tsx
│   │   ├── Certificates.tsx
│   │   ├── Contracts.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Energy.tsx
│   │   ├── Reports.tsx
│   │   ├── RiskAndPrediction.tsx
│   │   ├── SupplierDetails.tsx
│   │   ├── Suppliers.tsx
│   │   └── Vehicles.tsx
│   │
│   ├── auth/
│   │   ├── Login.tsx
│   │   └── Unauthorized.tsx
│   │
│   └── supplier/
│       ├── Dashboard.tsx
│       ├── MyAlerts.tsx
│       ├── MyCertificates.tsx
│       ├── MyCompany.tsx
│       ├── MyCompliance.tsx
│       ├── MyContracts.tsx
│       ├── MyEnergy.tsx
│       ├── MyRiskAndPrediction.tsx
│       ├── MyVehicles.tsx
│       └── RequiredActions.tsx
│
├── services/                    # Application-level services
│   └── notificationService.ts
│
├── styles/                      # Global styling
│   └── globals.css
│
├── types/                       # Shared TypeScript domain types
│   ├── alert.ts
│   ├── auth.ts
│   ├── certificate.ts
│   ├── contract.ts
│   ├── dashboard.ts
│   ├── energy.ts
│   ├── notification.ts
│   ├── risk.ts
│   ├── supplier.ts
│   └── vehicle.ts
│
└── utils/                       # Shared utility functions
    ├── csv.ts
    ├── formatDate.ts
    ├── formatNumber.ts
    ├── formatSyncTime.ts
    ├── initials.ts
    └── riskColor.ts
```

## Scripts

```bash
npm run dev       # start the dev server
npm run build     # type-check (tsc -b) + production build
npm run preview   # preview the production build locally
npm run test      # run tests (vitest)
```
