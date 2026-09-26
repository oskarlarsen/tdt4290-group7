# TDT4290 Group 7 — Environmental monitoring dashboard

TDT4290 project with a React/TypeScript frontend and a Kotlin/Ktor backend. The backend stores vehicle statistics and approvals and checks one registration number against local approvals and Statens vegvesen (SVV).

## Repository layout

- `frontend/`: React + TypeScript + Vite dashboard.
- `backend/`: Ktor HTTP API, SQLite storage, and SVV integration.

See [the backend guide](backend/README.md) for endpoint parameters, responses, database relationships, configuration, request flow, logging, and step-by-step Postman testing.

## Frontend setup

From the repository root in PowerShell:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Do not overwrite an existing configured `.env`. Other commands: `npm run build`, `npm test`, and `npm run preview`.

The example frontend configuration enables mocks and points at `http://localhost:8080/api`. The backend permits the Vite origin `localhost:5173` by default. Authentication routes are available; the frontend's vehicle integration must use the routes documented in the backend guide.

## Backend setup

Install JDK 21. From the repository root:

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env locally if live SVV requests are needed.
.\gradlew.bat test
.\gradlew.bat run
```

Keep the server terminal open. In another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
```

Expected response: `{"status":"UP"}`. Stop with `Ctrl+C`.

The backend runs without an SVV key: local data remains usable, but a registry lookup without a usable snapshot reports `NOT_CONFIGURED`. SQLite is created automatically at `backend/data/vehicles.db` when running from `backend/`.

## Local data and credentials

Keep the SVV key in the ignored `backend/.env`, never in frontend settings or request bodies. Keep confidential datasets, real vehicle responses, logs containing them, and databases local. Agents must not inspect them. Shared examples must use synthetic data.

The backend includes JWT authentication for `/api/auth/me` and `/api/auth/logout`. Vehicle endpoints remain unauthenticated. The default host is loopback for local development. Consult the backend guide before exposing it elsewhere.

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
