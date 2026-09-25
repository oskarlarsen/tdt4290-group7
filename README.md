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
