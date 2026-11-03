# TDT4290 Group 7 — Environmental Monitoring & Contract Compliance

A municipal dashboard for following up suppliers and their environmental contract requirements. Administrators can review supplier risks, manage vehicle agreements and compare reported vehicle data with Statens vegvesen.

The application is a prototype: some areas have working workflows, while others are demonstration screens or placeholders.

## What is included

| Area | Purpose and current status |
|---|---|
| Dashboard | Demo overview of totals/metrics, compliance rates, supplier risks and alerts. Includes placeholder CSV export button. |
| Suppliers | Demo directory with supplier details, notes and follow-up status. The Add Supplier action opens the backend-backed onboarding flow. |
| Contracts | Demo compliance directory plus a separate list of imported supplier service contracts. |
| Vehicles | Backend-connected supplier and agreement management, registered/planned vehicles, statistics, registry checks and change history with undo. |
| Supplier onboarding | Admins can create suppliers, validate service-contract CSV files, preview rows and import contracts atomically. |
| Environmental Certificates | Admins can upload PDF certificates linked to an imported service contract and review extracted metadata. Registry verification and automatic reminders are not connected. |
| Energy & Fuel | Placeholder page for energy and fuel reporting. |
| Risk & Prediction | Placeholder page for risk analysis. |
| Alerts | Placeholder page for alerts. |
| Reports | Placeholder page. |
| Supplier workspace | Navigation for dashboard, company, contracts, vehicles, certificates, energy, compliance, risk, alerts and required actions; the pages are placeholders. |
| Authentication | Admin/supplier sign-in, logout and session handling. Password-reset API exists; email delivery is not connected. |

Dashboard risk metrics and most supplier/contract details remain demo data and are not linked to the backend supplier directory. Imported service contracts are persisted separately and appear in Contracts and the certificate workflow.

## Run locally

Use local npm + Gradle for development. [Docker Compose](#run-with-docker) is an alternative for running both services together.

### 1. Prerequisites

Install Git, **Node.js 22.22.2 or newer within the Node 22 release line** (with npm), and **JDK 21**. Node 22 matches CI; the minimum version also supports the locked test dependencies. Gradle is included through the repository's wrapper.

Check your installations in a terminal:

```sh
git --version
node --version
npm --version
java -version
```

### 2. Get the project and configure it

```sh
git clone https://github.com/oskarlarsen/tdt4290-group7.git
cd tdt4290-group7
```

Create `.env` in the repository root. Reuse it if you already have one.

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS:

```sh
cp .env.example .env
```

Open `.env` in your editor and fill in:

| Setting | Value to provide |
|---|---|
| `JWT_SECRET` | A generated signing secret. |
| `SEED_ADMIN_PASSWORD` | Your password for the seeded admin account. |
| `SEED_SUPPLIER_PASSWORD` | Your password for the seeded supplier account. |

Generate a signing secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Set `VITE_USE_MOCKS=true` when you want demo data on prototype pages; keep `VITE_USE_MOCK_AUTH=false` for backend sign-in, vehicles and certificate uploads. Docker Compose defaults demo data off.

`SVV_API_KEY` is optional for startup. Adding or replacing a registered vehicle requires a working "Statens-vegvesen-API-key". Without one, you can still manage suppliers, agreements and planned entries.

See [configuration](docs/configuration.md) for optional settings and troubleshooting.

### 3. Start the backend

From the repository root:

```sh
cd backend
```

PowerShell:

```powershell
.\gradlew.bat run
```

macOS:

```sh
./gradlew run
```

The API runs at `http://localhost:8080`. Open `http://localhost:8080/health` to check that it returns `{"status":"UP"}`. SQLite is created automatically; no database installation is needed.

### 4. Start the frontend

Open a second terminal in the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173**. Use `localhost` for both the frontend and API so the login cookie works.

### 5. Sign in

| Role | Email | Password |
|---|---|---|
| Admin | `advisor.hansen@kommune.no` | Your `SEED_ADMIN_PASSWORD` value. |
| Supplier | `supplier@nordvik.no` | Your `SEED_SUPPLIER_PASSWORD` value. |

Use the admin account to explore the implemented workflows. Vehicles starts empty; create a supplier and agreement before adding vehicles. Supplier sign-in opens the placeholder workspace.

## Run with Docker

Install and start Docker with Compose support. From the repository root, complete the `.env` configuration above, then run:

```sh
docker compose up --build
```

Open **http://localhost:3000** and sign in with the same accounts. The backend uses port `8080`, so stop the local backend before starting Docker. Both startup paths use the same configuration file, but keep separate vehicle databases.

```sh
docker compose down
```

This stops the stack and retains its databases in the named volume. After source or frontend configuration changes, run `docker compose up --build` again. The backend image includes Tesseract with English and Norwegian language data for scanned certificates.

## Development and troubleshooting

- [Frontend](frontend/README.md): commands and code navigation.
- [Backend](backend/README.md): commands, storage and integrations.
- [API reference](docs/api.md): implemented endpoints and request examples.
- [Certificate parser](docs/certificate-parser.md): optional PDF/OCR setup.
- [Supplier onboarding tutorial](docs/supplier-onboarding.md): create a supplier and import linked service contracts from CSV.
- [Configuration and troubleshooting](docs/configuration.md): login, startup and existing-data issues.
- [Repository rules](.github/rulesets/README.md): maintainer instructions for branch protection.
