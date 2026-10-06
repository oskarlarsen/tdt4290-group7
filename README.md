# TDT4290 Group 7 — Environmental Monitoring & Contract Compliance

Municipal environmental monitoring dashboard for Trondheim kommune (TDT4290).

- `frontend/` — React + TypeScript + Vite
- `backend/` — Kotlin + Ktor

See [`frontend/`](frontend) and [`backend/README.md`](backend/README.md) for
details on running each service on its own.

## Run the services individually

```bash
# backend (http://localhost:8080)
cd backend
./gradlew run

# frontend (http://localhost:5173), in another terminal
cd frontend
npm install
cp .env.example .env
npm run dev
```

The frontend's `.env` points at `VITE_API_BASE_URL` (defaults to
`http://localhost:8080/api`), and the backend accepts requests from
`http://localhost:5173` by default, so no extra CORS config is needed for local dev. Set `JWT_SECRET`, `SEED_ADMIN_PASSWORD`, and `SEED_SUPPLIER_PASSWORD` before starting the backend.

## Run the full stack with Docker

```bash
cp .env.example .env   # fill in JWT_SECRET, SEED_ADMIN_PASSWORD, SEED_SUPPLIER_PASSWORD
docker compose up --build
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8080](http://localhost:8080)

`docker compose` reads `.env` at the repo root; see `.env.example` for the
variables it needs (compose refuses to start without `JWT_SECRET` and the
seed account passwords set). See [`backend/README.md`](backend/README.md#authentication)
for what those seed accounts are and what the auth endpoints look like.

## Frontend environment variables

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL for the real backend API (e.g. `http://localhost:4000/api`) |
| `VITE_USE_MOCKS` | Set to `true` to run entirely against the built-in mock data layer, with no backend required |

Set `VITE_USE_MOCKS=true` in `frontend/.env` to run the frontend without the
backend. See [Mock data architecture](#mock-data-architecture)
below for how this is structured.

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