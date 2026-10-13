# Admin vehicle page draft

The vehicle page is at `/admin/vehicles` and connects to the real Kotlin backend. It does **not** use vehicle mock fixtures. Supplier vehicle pages are unchanged. The existing admin layout, colour palette and details-drawer pattern are reused.

## Run locally

1. Configure the single root `.env` as described in [shared configuration](../README.md#shared-local-configuration), then start the backend using JDK 21 and a development database. Credentials are read from that file automatically.
2. From `frontend/`, run `npm.cmd ci`. Do not create a separate frontend `.env`: Vite uses `envDir: ".."` to read root settings.
3. In root `.env`, set `VITE_API_BASE_URL=http://localhost:8080/api`. For real login also set `VITE_USE_MOCKS=false`; login with `advisor.hansen@kommune.no` and the password set in `SEED_ADMIN_PASSWORD`.
4. Run `npm.cmd run dev` and open `http://localhost:5173/admin/vehicles`. Use `localhost` for both frontend and API so the auth cookie stays same-site. Allow that origin in backend CORS. For local HTTP set `AUTH_COOKIE_SECURE=false`, not in production.

`VITE_USE_MOCKS` affects login, not vehicle calls. With mock login, `admin@kommune.no` / `admin123` can open the UI, but a backend must still be running. Vite exposes only keys prefixed `VITE_`; SVV/JWT keys and seed passwords must never use that prefix. Process settings override file settings. Restart Vite after changing settings; Docker public build settings require rebuilding the image. `npm.cmd run build` checks TypeScript and builds production assets; `npm.cmd test -- --run` runs the unit tests. Docker receives only `VITE_API_BASE_URL` and `VITE_USE_MOCKS` as frontend build arguments, and `API_ORIGIN` as a public runtime setting for nginx's CSP; no backend secrets or root file are copied into the frontend image.

## Behaviour and safeguards

- The overview reads a paginated vehicle list, with normalized plate search and current approval filtering. It separates today's approval from the latest historical check; empty/error/loading states are explicit. Vehicle selection is deep-linked via `?plate=...`.
- The native modal drawer traps focus and offers Overview, Statistics, Check result and History sections. Browsing only issues GET requests. Run check is an explicit POST, with force-refresh under Check options. No automatic POST retries, background checks or bulk operations are enabled.
- Statistics entry sends exactly one reporting row with mandatory ISO dates. All other agreed spreadsheet fields are optional. CO₂-emitting has three choices: not provided, yes, no. Blank values stay absent rather than becoming false/zero. Consumption is L/km (not L/100 km); total fuel is litres; supplier NOx total is grams over its related distance. Median CO₂ is stored without assuming a meaning.
- Decimal inputs remain text while editing, are validated against the backend's non-negative 64-bit integer-plus-scale range, and are serialized as exact JSON numeric literals. Decimal response fields are decoded as strings for display without JavaScript floating-point rounding; ordinary counts/page values remain numbers. The backend is still authoritative for validation and calculated CO₂ estimates.
- Statistics always append, including duplicates. The form checks current reporting rows and requires acknowledgment before appending an overlapping period. A network failure after submitting is ambiguous: inspect stored rows before resubmitting. Buttons are disabled during requests; the API still has no idempotency guarantee. Rows are shown individually without summing potentially overlapping periods.
- Approval editing starts with the complete stored record and explicitly sends optional fields, so cleared fields are cleared intentionally. The top-level form refuses to overwrite an existing unrevoked approval; open that vehicle and use Edit approval instead. A preflight read detects already-changed approvals, but this is **not** an atomic optimistic-lock guarantee: a concurrent writer between GET and POST may still win under the existing API contract.
- Blank approval start means immediate, and the explicit indefinite option clears expiry. Revocation requires typing the plate; history is retained. Reapproving a revoked vehicle starts a new record. Changing approval/statistics does not automatically run a check or rewrite earlier results.
- History is paginated; selecting a result reads its original evidence and does not refresh SVV. Stale/unavailable registry information is never presented as a clean verification. Usage prohibition remains unknown. No new fuel, CO₂, NOx or Euro-class comparison rules are added; SVV measurements stay grouped by fuel and measurement method.

## Code map

- `src/pages/admin/Vehicles.tsx`: overview, filters, pagination and entry actions.
- `src/components/vehicles/`: table, native dialogs, individual forms, details/history and check evidence.
- `src/api/vehicles.ts`, `src/hooks/useVehicles.ts`: typed real requests and read-cache invalidation after successful mutations.
- `src/types/vehicle.ts`: API response types; `src/utils/vehicle.ts`: exact decimal handling, validation and presentation helpers.
- `tests/vehicle.test.ts`: synthetic decimal, date, payload and incomplete-verification regression tests.

Vehicle routes are currently unauthenticated. An admin frontend guard is not backend authorization. Keep this draft local until access control is implemented. Statistics paging, batch actions, supplier ownership/UI and environmental comparisons are deliberately outside this draft.
