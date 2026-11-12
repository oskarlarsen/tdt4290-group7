# TDT4290 Group 7 — Environmental Monitoring & Contract Compliance

A municipal dashboard for following up suppliers and their environmental contract requirements. Administrators can review supplier risks, manage vehicle agreements and compare reported vehicle data with Statens vegvesen.

The application is a prototype: some areas have working workflows, while others are demonstration screens or placeholders.

## What is included

| Area | Purpose and current status |
|---|---|
| Dashboard | Backend-connected overview of totals, risk classification, issue categories and alerts, computed from stored vehicle checks and certificates. Includes placeholder CSV export button. |
| Suppliers | Backend-connected directory with supplier details, notes and follow-up status, next to organization, agreement and invitation management. |
| Contracts | Active agreements as contracts, with each supplier's stored risk, compliance summaries and placeholder CSV export. |
| Vehicles | Backend-connected supplier and agreement management, registered/planned vehicles, statistics, registry checks and change history with undo. |
| Environmental Certificates | Admins can upload PDF certificates for backend text/OCR extraction and review parsed metadata. Contract attachments, registry verification and automatic reminders are not connected. |
| Energy & Fuel | Shows no records until the backend has per-contract energy requirements; demo records are available with `VITE_USE_MOCKS=true`. |
| Risk & Prediction | Placeholder page for risk analysis. |
| Alerts | Backend-connected alerts with manual alerts, status changes, archive and restore. |
| Reports | Placeholder page. |
| Supplier workspace | Backend-connected onboarding dashboard for contact details, checklist progress, CSV template/download, validation preview, imports and submission. Other supplier pages remain placeholders. |
| Authentication | Admin/supplier sign-in, logout and session handling. Password-reset API exists; email delivery is not connected. |

### Real data or demo data

The app runs in one of two ways. Nothing else changes between them.

| | Real data (default) | Demo data |
|---|---|---|
| How | Start the app as described below. | After the backend is running, also run `SEED_ADMIN_PASSWORD=<your admin password> node scripts/seed-demo-data.mjs` and build the frontend with `VITE_USE_MOCKS=true`. |
| Suppliers, agreements, vehicles, certificates, alerts, notes | Only what is entered in the app. | Eight demo suppliers with agreements, planned vehicles, certificates, alerts and notes, written to the database through the API. The script can be run twice safely. |
| Contracts and Risk | Built from real agreements. | Same, built from the seeded agreements. |
| Energy | Empty until energy reporting is connected. | Fictional consumption attached to the real contracts. |

To go back to real data, remove the database (`docker compose down -v`) and start without the script and with `VITE_USE_MOCKS=false`.

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

Generate a signing secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

Keep `VITE_USE_MOCKS=false` and `VITE_USE_MOCK_AUTH=false` as supplied. Set `VITE_USE_MOCKS=true` only together with the demo data script (see "Real data or demo data"); it adds fictional energy records.

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

The API runs at `http://localhost:8080`. Open `http://localhost:8080/health` to check that it returns `{"status":"UP"}`. SQLite is created automatically as one file, `backend/data/app.db`; no database installation is needed.

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

Use the admin account to explore the implemented workflows. Vehicles starts empty; create a supplier, then invite a contact from that supplier's card. Share the one-time activation link with the contact; they set their password and the account is linked to the organization automatically.

## Run with Docker

Install and start Docker with Compose support. From the repository root, complete the `.env` configuration above, then run:

```sh
docker compose up --build
```

Open **http://localhost:3000** and sign in with the same accounts. The backend uses port `8080`, so stop the local backend before starting Docker. Both startup paths use the same configuration file, but keep separate databases.

```sh
docker compose down
```

This stops the stack and retains its database in the named volume. After source or frontend configuration changes, run `docker compose up --build` again. The optional OCR tool is not included in the container setup.

## Development and troubleshooting

- [Frontend](frontend/README.md): commands and code navigation.
- [Backend](backend/README.md): commands, storage and integrations.
- [API reference](docs/api.md): implemented endpoints and request examples.
- [Certificate parser](docs/certificate-parser.md): optional PDF/OCR setup.
- [Configuration and troubleshooting](docs/configuration.md): login, startup and existing-data issues.
- [Repository rules](.github/rulesets/README.md): maintainer instructions for branch protection.
