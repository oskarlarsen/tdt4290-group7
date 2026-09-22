# Backend

Kotlin/Ktor backend service.

## Prerequisites

- JDK 21 (Eclipse Temurin, Amazon Corretto, or Azul Zulu)
- Docker or Rancher Desktop (only needed for the container option below)

## Run locally with Gradle

From the `backend/` folder:

```bash
./gradlew run
```

The server starts on [http://localhost:8080](http://localhost:8080). Stop it with `Ctrl+C`.

By default it listens on port `8080`; override with the `PORT` environment variable:

```bash
PORT=9000 ./gradlew run
```

### Verify it's working

```bash
curl http://localhost:8080/health
# {"status":"UP"}
```

### Run tests

```bash
./gradlew test
```

## Authentication

The backend has no database yet, so a small set of demo accounts is seeded
in-memory at startup:

| Email                          | Role     | Password env var         |
| ------------------------------- | -------- | ------------------------- |
| `advisor.hansen@kommune.no`     | ADMIN    | `SEED_ADMIN_PASSWORD`     |
| `supplier@nordvik.no`           | SUPPLIER | `SEED_SUPPLIER_PASSWORD`  |

If a seed password env var isn't set, an insecure development-only default is
used and a warning is logged — set both explicitly outside local dev.

Endpoints (all under `/api/auth`):

- `POST /login` — `{ email, password, rememberMe }` → `{ token, expiresAt, user }`
- `POST /logout` — requires `Authorization: Bearer <token>`
- `GET /me` — requires `Authorization: Bearer <token>`, returns the current user
- `POST /forgot-password` — `{ email }`, always responds `200` (no account enumeration)

`/login` and `/forgot-password` are rate-limited to 10 requests/minute per
client IP.

Relevant environment variables:

| Variable                 | Default (dev only)                     | Purpose                                   |
| ------------------------- | --------------------------------------- | ------------------------------------------ |
| `JWT_SECRET`               | insecure fallback, logged loudly        | Signs and verifies JWTs                   |
| `JWT_ISSUER`                | `tdt4290-backend`                       | JWT `iss` claim                           |
| `JWT_AUDIENCE`              | `tdt4290-frontend`                      | JWT `aud` claim                           |
| `SEED_ADMIN_PASSWORD`       | insecure fallback, logged loudly        | Password for the seeded admin account     |
| `SEED_SUPPLIER_PASSWORD`    | insecure fallback, logged loudly        | Password for the seeded supplier account  |
| `CORS_ALLOWED_ORIGINS`      | `localhost:5173`                        | Comma-separated `host:port` origins allowed to call the API |

## Run locally with Docker

Build the image:

```bash
docker build -t ktor-backend .
```

Run the container:

```bash
docker run -p 8080:8080 ktor-backend
```

Verify:

```bash
curl http://localhost:8080/health
# {"status":"UP"}
```

To run the backend together with the frontend, see the
[repo-root README](../README.md#run-the-full-stack-with-docker).
