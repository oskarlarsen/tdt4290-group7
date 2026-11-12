# Configuration

[Local and Docker setup](../README.md#run-locally) uses one repository-root `.env`, based on [`.env.example`](../.env.example).

The backend and Vite load it when started from their documented directories. Restart after changes; Docker frontend settings require an image rebuild. Explicit process environment variables override file values, including blank values. Use literal single-line values; single-quote values containing `$` or `#`. The backend does not expand `${OTHER_VARIABLE}` references.

## Application settings

| Setting | Default / requirement | Use |
|---|---|---|
| `JWT_SECRET` | Required | Sign backend sessions. |
| `SEED_ADMIN_PASSWORD` | Required | Seed `advisor.hansen@kommune.no`. |
| `VITE_API_BASE_URL` | Template: `http://localhost:8080/api` | API address used by the browser. |
| `VITE_USE_MOCKS` | Template: `false` | Enable demo data on the Contracts and Energy pages, which have no backend yet; off by default, including Docker Compose. The dashboard, suppliers, risk and alerts pages always use the backend. |
| `VITE_USE_MOCK_AUTH` | Template: `false` | Enable offline demo sign-in instead of backend authentication. |
| `SVV_API_KEY` | Optional | Enable live Statens vegvesen Enkeltoppslag requests. Required for adding/replacing registered vehicles. |
| `SVV_CACHE_TTL_DAYS` | `14` | Age in days before a saved registry snapshot needs refreshing during a check. |
| `CORS_ALLOWED_ORIGINS` | Template: `http://localhost:5173,http://localhost:3000` | Frontend origins allowed by the API. |
| `AUTH_COOKIE_SECURE` | `true` | Set `false` for local HTTP if the browser rejects the login cookie. |

## Optional settings

| Setting | Default | Use |
|---|---|---|
| `HOST` | `127.0.0.1` natively | Backend listening address. |
| `PORT` | `8080` | Backend listening port. |
| `DATABASE_PATH` | `data/app.db` | The single SQLite file for everything (suppliers, vehicles, accounts, certificates, alerts), relative to the backend working directory unless absolute. See [Database](#database). |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `tdt4290-backend` / `tdt4290-frontend` | Session issuer and audience. |
| `APP_ENV` | `prod` | Select `dev` to allow development-only password-reset logging. |
| `ALLOW_DEV_PASSWORD_RESET_LOG` | `false` | Log reset tokens locally; requires `APP_ENV=dev`. Email delivery is not implemented. |
| `TRUSTED_PROXY_HOPS` | `0` | Number of trusted proxies ahead of the API; leave at zero for direct local access. Set it to the exact count in each deployment: too low and all users behind the proxy share one login rate-limit bucket, too high and clients can spoof their IP to dodge the limit. |
| `API_ORIGIN` | `http://localhost:8080` | API origin permitted by the Docker frontend's content security policy; match the origin in `VITE_API_BASE_URL`. |
| `TESSERACT_PATH` | Executable discovery / `tesseract` | Optional executable path for the [certificate parser](certificate-parser.md). |

Compose fixes the backend's container address, port and database location (`/app/data/app.db`). It does not pass through host `HOST`, `PORT` or `DATABASE_PATH` overrides. The backend image includes Tesseract and its English/Norwegian language data.

For isolated tooling, `BACKEND_ENV_FILE` in the process environment selects another configuration file; relative paths use the server's working directory. Tests use this to avoid local configuration.

## Frontend-only demo

Only the Contracts and Energy pages can run without the backend: set both `VITE_USE_MOCKS=true` and `VITE_USE_MOCK_AUTH=true`, then start Vite. The dashboard, suppliers, risk, alerts and vehicle workflow need the backend and a real admin session.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@kommune.no` | `admin123` |
| Supplier | `supplier@leverandor.no` | `supplier123` |

Restore `VITE_USE_MOCK_AUTH=false` and restart Vite to use backend sign-in again. The main setup uses backend sign-in throughout.

## Troubleshooting

| Problem | Action |
|---|---|
| Backend reports a missing required setting | Fill both required values in root `.env`. Check for an old process environment override if the file already contains a value. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` for the same commands, for example `npm.cmd ci`. |
| Gradle cannot find Java 21 | Check `java -version` and that `JAVA_HOME`, if set, points to JDK 21. |
| Dependency installation/tests reject the Node version | Use Node 22.22.2 or newer within Node 22. Node 24 requires at least 24.15.0 for the locked test dependencies. |
| Port `5173` or `8080` is occupied | Stop the other instance, or update the port and corresponding API/CORS configuration together. Vite uses a fixed port. |
| Sign-in succeeds but the session is lost | Use `localhost` consistently for frontend and API. If the browser rejects Secure cookies over local HTTP, set `AUTH_COOKIE_SECURE=false` and restart the backend. |
| Login fails after switching demo mode | Use the matching account table and restart Vite after changing `VITE_USE_MOCK_AUTH`. |
| Vehicles returns `401` or `403` | Sign in with the real backend admin account; mock sign-in and supplier accounts cannot access vehicle APIs. |
| Contracts or Energy fail after turning demo data off | Their backend endpoints are not implemented; restore `VITE_USE_MOCKS=true`. |
| Adding a registered vehicle reports the registry is unavailable | Provide a working `SVV_API_KEY` and restart the backend. A cached check does not replace the live lookup required for entry. |
| Backend reports an incompatible database | Preserve the existing file. For a separate native instance, set `DATABASE_PATH=data/app-new.db`. Existing data is not migrated into the new file. Container volumes require a separate data-handling decision. |
| Backend stops with "Could not merge the old databases" | The message lists the rows whose links are broken (for example a user pointing at a supplier that no longer exists). Nothing was changed. Fix or remove those rows in the old file, or restore a backup, and start again. See [Database](#database). |
| Docker cannot connect to its daemon | Start Docker before running Compose. |
| Docker frontend cannot reach the API | Check `VITE_API_BASE_URL`, `API_ORIGIN` and `CORS_ALLOWED_ORIGINS`, then rebuild the frontend. |

## Database

All data lives in one SQLite file, `DATABASE_PATH` (default `data/app.db`; `/app/data/app.db` in Docker). It runs in WAL mode, so next to `app.db` you will see `app.db-wal` and `app.db-shm` while the backend runs. Suppliers, agreements, vehicles, accounts, invitations, certificates, alerts and notes have real foreign keys between them where they refer to each other.

**Upgrading from the four separate files.** Earlier versions used `vehicles.db`, `users.db`, `certificates.db` and `admin-insights.db`. On the first start, if `app.db` does not exist and any of these is found next to it (or where the old `VEHICLE_DB_PATH`, `USER_DB_PATH`, `CERTIFICATE_DB_PATH` and `ADMIN_INSIGHTS_DB_PATH` pointed), the backend merges them automatically:

1. It builds `app.db.tmp`, copies every table, and lets SQLite check every link (`foreign_key_check`) and the file (`integrity_check`).
2. Only if everything is fine it renames `app.db.tmp` to `app.db` and renames the old files to `*.pre-merge`.
3. If a link is broken it stops with a message listing the rows. Nothing is changed and the old files are untouched.

The four old settings are only read to find the old files; after the merge they are ignored.

**Rolling back the merge.** Stop the backend, delete `app.db`, rename the `*.pre-merge` files back, and start the previous build. Anything written after the merge is lost.

**Backups.** Stop the backend and copy `app.db` together with `app.db-wal` and `app.db-shm` if they exist. Copying only `app.db` while the backend runs can miss committed data. The file contains password hashes and supplier data, so store backups accordingly. WAL needs a local filesystem; do not put the file on a network share.

**Resetting.** `backend/scripts/reset-vehicle-data.ps1` deletes the whole database, accounts included. The administrator is created again from `SEED_ADMIN_PASSWORD` on the next start.

**Shared vehicles.** The same vehicle can be listed under several agreements, also of different suppliers. Each listing counts against its own agreement's allowed number of vehicles, is checked against its own agreement, and has its own contract details; a supplier sees only the listings under its own agreements. The vehicle itself (its registry data and reported rows) exists once. Removing or replacing a listing names the agreement (`agreementId`). This needs schema version 11: on first start the existing listings and their change history are copied to the new per-agreement tables, and builds from before this change refuse to open the file (restore the backup to go back).

**Archived suppliers.** Removing a supplier never deletes it. It moves to the archive (Suppliers page, "Archived suppliers"), keeps its agreements, vehicles, certificates and alerts, and its user accounts are blocked and open invitations cancelled. If the same organization number is added again, the admin is asked "Is this the same supplier?" and can reactivate it. Reactivating keeps the old agreements archived and the old accounts blocked; invite a contact again and the same account is reused.
