# TDT4290 Group 7 — Environmental Monitoring & Contract Compliance

TDT4290 project with a React/TypeScript frontend and a Kotlin/Ktor backend. The backend stores vehicle statistics and approvals and checks one registration number against local approvals and Statens vegvesen (SVV).

## Repository layout

- `frontend/`: React + TypeScript + Vite dashboard.
- `backend/`: Ktor HTTP API, SQLite storage, and SVV integration.

See [the backend guide](backend/README.md) for endpoint parameters, responses, database relationships, configuration, request flow, logging, and step-by-step Postman testing.

The admin vehicle-page draft is at `/admin/vehicles`. It connects to real vehicle endpoints and supports individual statistics entry, approval management, explicit checks and check history. See [the frontend vehicle guide](frontend/README.md) for setup, safeguards and code organization. Supplier vehicle pages and batch actions are not included.

## Frontend setup

From the repository root in PowerShell:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Do not overwrite an existing configured `.env`. Other commands: `npm run build`, `npm test`, and `npm run preview`.

The example frontend configuration enables mock login and points at `http://localhost:8080/api`. The admin vehicle page always uses the real backend, regardless of the mock toggle. For real backend login, set `VITE_USE_MOCKS=false`; other prototype pages may still depend on their mock data layer. The backend permits the Vite origin `http://localhost:5173` by default. Authentication routes use cookies; vehicle routes are documented in the backend guide.

## Backend setup

Install JDK 21. From the repository root:

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env locally if live SVV requests are needed.
.\gradlew.bat test
# Required process settings; choose private local values before running.
$env:JWT_SECRET = "<choose a random signing secret>"
$env:SEED_ADMIN_PASSWORD = "<choose an admin password>"
$env:SEED_SUPPLIER_PASSWORD = "<choose a supplier password>"
.\gradlew.bat run
```

Keep the server terminal open. In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
```

Expected response: `{"status":"UP"}`. Stop with `Ctrl+C`.

The backend runs without an SVV key: local data remains usable, but a registry lookup without a usable snapshot reports `NOT_CONFIGURED`. SQLite is created automatically at `backend/data/vehicles.db` when running from `backend/`.

Vehicle storage now uses strict relational tables, registration numbers as vehicle primary keys, exact decimal quantities, mandatory statistics periods, and selected SVV fields only. Check history is retained indefinitely; the 14-day SVV cache setting controls freshness, not retention. This intentionally breaks the earlier JSON-backed mock schema/API. See the [vehicle API guide](backend/README.md#shared-request-rules) and [mock-only reset instructions](backend/README.md#development-reset-and-incompatibility) before using an older database.

## Local data and credentials

Keep the SVV key in the ignored `backend/.env`, never in frontend settings or request bodies. Keep confidential datasets, real vehicle responses, logs containing them, and databases local. Agents must not inspect them. Shared examples must use synthetic data.

The backend includes cookie-based JWT authentication and clears the cookie on logout. Vehicle endpoints remain unauthenticated. The default host and Compose's published backend port are bound to loopback for local development. Authentication and authorization for vehicle endpoints are pending separate work; implement them before deploying or exposing the backend to other machines.

## Run the full stack with Docker

From the repository root:

```powershell
Copy-Item .env.example .env
# Set JWT_SECRET, SEED_ADMIN_PASSWORD, and SEED_SUPPLIER_PASSWORD locally.
docker compose up --build
```

Do not overwrite an existing configured `.env`. Compose requires those three values. The root `.env` configures Compose; `backend/.env` configures standalone SVV lookup. They are separate files. Optional root SVV settings are passed to the backend by Compose.

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`

Compose retains SQLite in the `vehicle-backend-data` named volume. Authentication demo users are in memory and recreated on restart, unlike vehicle data. See [authentication](backend/README.md#authentication) for endpoints and account configuration.

## Frontend environment variables

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL for the real backend API (normally `http://localhost:8080/api`) |
| `VITE_USE_MOCKS` | Enables mock login and existing prototype mock layers; does not mock the admin vehicle page |

Set `VITE_USE_MOCKS=true` in `frontend/.env` to explore existing mock pages without the
backend. The admin vehicle page still requires the backend. See [Mock data architecture](#mock-data-architecture)
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
