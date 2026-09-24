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
`ALLOW_DEV_PASSWORD_RESET_LOG=true` and the reset token is written to the
backend log. Never enable this anywhere else: anyone who can read the logs can
take over any account.

The JWT is only ever sent as that HttpOnly cookie, so page scripts can't read it;
`Authorization` headers are ignored. Because the cookie is `SameSite=Strict`, the
frontend and the API must be served from the same site (e.g. `localhost:3000` and
`localhost:8080`, or `app.example.no` and `api.example.no`). Requests from origins
not in `CORS_ALLOWED_ORIGINS` are rejected with `403`.

`/login` and `/forgot-password` are rate-limited to 10 requests/minute per
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
| `ALLOW_DEV_PASSWORD_RESET_LOG` | `false`                            | Log password reset tokens (local dev only) |
| `AUTH_COOKIE_SECURE`        | `true`                                  | Set `false` only if a local browser drops Secure cookies on `http://localhost` (Safari) |
| `TRUSTED_PROXY_HOPS`        | `0`                                     | Number of proxies in front of the backend; client IPs for rate limiting are then read from `X-Forwarded-For`. Keep `0` if clients connect directly, or the header can be spoofed |
| `CORS_ALLOWED_ORIGINS`      | `http://localhost:5173`                 | Comma-separated full origins (`scheme://host[:port]`) allowed to call the API. Each allows only its own scheme; use `https://` outside local dev |

## Run locally with Docker

Build the image:

```bash
docker build -t ktor-backend .
```

Run the container:

```bash
docker run -p 8080:8080 \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e SEED_ADMIN_PASSWORD=<choose one> \
  -e SEED_SUPPLIER_PASSWORD=<choose one> \
  ktor-backend
```

The container runs as an unprivileged `app` user. `docker compose` additionally
runs it with a read-only filesystem, no Linux capabilities and
`no-new-privileges`.

Verify:

```bash
curl http://localhost:8080/health
# {"status":"UP"}
```

To run the backend together with the frontend, see the
[repo-root README](../README.md#run-the-full-stack-with-docker).
