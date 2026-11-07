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
| `VEHICLE_DB_PATH` | `data/vehicles.db` | SQLite path, relative to the backend working directory unless absolute. |
| `CERTIFICATE_DB_PATH` | `data/certificates.db` | SQLite path for certificate metadata, independent of `VEHICLE_DB_PATH`. |
| `USER_DB_PATH` | `data/users.db` | SQLite path for persistent user accounts and supplier invitations. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `tdt4290-backend` / `tdt4290-frontend` | Session issuer and audience. |
| `APP_ENV` | `prod` | Select `dev` to allow development-only password-reset logging. |
| `ALLOW_DEV_PASSWORD_RESET_LOG` | `false` | Log reset tokens locally; requires `APP_ENV=dev`. Email delivery is not implemented. |
| `TRUSTED_PROXY_HOPS` | `0` | Number of trusted proxies ahead of the API; leave at zero for direct local access. Set it to the exact count in each deployment: too low and all users behind the proxy share one login rate-limit bucket, too high and clients can spoof their IP to dodge the limit. |
| `API_ORIGIN` | `http://localhost:8080` | API origin permitted by the Docker frontend's content security policy; match the origin in `VITE_API_BASE_URL`. |
| `TESSERACT_PATH` | Executable discovery / `tesseract` | Optional executable path for the [certificate parser](certificate-parser.md). |

Compose fixes the backend's container address, port and database locations, including `/app/data/certificates.db` for certificate metadata. It does not pass through host `HOST`, `PORT` or `VEHICLE_DB_PATH` overrides. The backend image includes Tesseract and its English/Norwegian language data.

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
| Backend reports an incompatible database | Preserve the existing file. For a separate native instance, set `VEHICLE_DB_PATH=data/vehicles-new.db`. Existing data is not migrated into the new file. Container volumes require a separate data-handling decision. |
| Docker cannot connect to its daemon | Start Docker before running Compose. |
| Docker frontend cannot reach the API | Check `VITE_API_BASE_URL`, `API_ORIGIN` and `CORS_ALLOWED_ORIGINS`, then rebuild the frontend. |
