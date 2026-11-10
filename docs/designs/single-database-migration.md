# Migrating from four SQLite files to one

Status: implemented on branch `single-database`, not committed. Sections 1–12 are the plan as written; section 13 lists what was built and where it differs.

## 1. Summary

The backend stores its data in four SQLite files. This plan merges them into one file, `data/app.db`, with real foreign keys between suppliers, users, agreements, certificates and alerts, and switches that file to WAL mode.

The merge runs automatically, once, at startup. It builds the new file next to the old ones, checks every link, and only then switches over. If anything fails, the old files are untouched and the backend refuses to start with a clear message.

What we gain:

* One file to back up and one schema version.
* The database itself rejects broken links between suppliers, users, agreements, certificates and alerts, on every code path.
* Writes that span suppliers, users and alerts can share one transaction (for example, deactivating a supplier together with its users and alerts).

What does not change:

* The application checks for *active* suppliers stay. A foreign key only proves a row exists. Suppliers are soft-deleted (`active = 0`), so their rows always exist, and only the code can tell whether one is active.
* Security is about the same. All four files already live in one volume, opened by one process as one OS user, so the split never was an access boundary.

## 2. Why: the current state

| File | Env var | Tables |
|---|---|---|
| `vehicles.db` | `VEHICLE_DB_PATH` | suppliers, agreements, vehicles, change history, trip rows, SVV snapshots, vehicle checks, onboarding tables |
| `users.db` | `USER_DB_PATH` | users, supplier_invitations, access_invitations |
| `certificates.db` | `CERTIFICATE_DB_PATH` | certificates |
| `admin-insights.db` | `ADMIN_INSIGHTS_DB_PATH` | admin_alerts, notifications, supplier_notes, supplier_review_statuses, admin_insights_metadata |

Links that cross files today, as plain text columns with no enforcement:

| Column | Points at |
|---|---|
| `users.supplier_id`, `supplier_invitations.supplier_id`, `access_invitations.supplier_id` | `suppliers.id` |
| `admin_alerts.supplier_id`, `supplier_notes.supplier_id`, `supplier_review_statuses.supplier_id` | `suppliers.id` |
| `certificates.contract_id` | `agreements.id` |

Other problems found while checking:

* Only `VehicleDatabase` and `UserRepository` enable `PRAGMA foreign_keys`. `CertificateRepository` and `AdminInsightsRepository` open bare connections, so any foreign key added to their tables would be silently ignored.
* Only `vehicles.db` has a schema version (`PRAGMA user_version`, currently 10).
* There is no documented backup procedure.

## 3. Evidence from dry runs

All runs used copies of seeded demo data in a scratch directory (8 suppliers, a removed supplier, a renamed supplier, supplier users, invitations, notes, alerts, certificates). The repository's `backend/data` was not touched.

| Dry run | Result |
|---|---|
| A. Point all four `*_DB_PATH` at one new file, no code change | **Startup fails**: `Vehicle database is not empty`. `UserRepository` is initialised first (`Application.kt:51`) and creates `users`, then `VehicleDatabase` sees a version-0 file with tables and refuses (`VehicleDatabase.kt:25`). |
| B. Copy all tables into one file with the foreign keys from section 5.3, then `PRAGMA foreign_key_check` | All rows copied (row counts match), `integrity_check` ok, **no violations**, including data of a removed and a renamed supplier. |
| B'. Same, with two planted orphans (a user and a note pointing at missing suppliers) | **Both caught**, transaction rolled back, target left without the new tables. |
| C. Current backend, unchanged, on the merged file: 14 functional calls across all four areas | All passed (login, fleet, certificates, dashboard, alerts, notes, invite, accept, supplier login, onboarding, supplier alerts, notifications). |
| D. 240 concurrent mixed requests, four files (today) | 0.7 s, 0 errors. |
| E. Same load, merged file, default rollback journal | **48.7 s, 74 errors** (`SQLITE_BUSY: database file is locked`), mostly from `refreshFindings`, which writes alerts on every admin read. |
| F. Same load, merged file, **WAL mode**, two runs | 0.47 s and 0.41 s, **0 errors**. |
| G. Block a live supplier user by setting `users.access_expires_at` to now (the mechanism proposed in 10.3), four-file setup | The existing session got `401` on `/auth/me`, `/supplier/alerts`, `/notifications` and `/onboarding/status` on the very next request (all `200` before). A fresh login also got `401`. Clearing the value again made the **same session** work (`200`), so the block is reversible and a re-invite does not need a new token. |

Conclusions:

1. Changing configuration alone is not enough: the schema has to be created in one place (dry run A).
2. The data merges cleanly, and SQLite's own check is a reliable gate (B, B').
3. **WAL mode is required.** Without it, the merged file locks up under modest load (E vs F). With rollback journals, a commit waits for every open reader of the file; today each file only has its own readers.

## 4. Target design

### 4.1 One file, one setting

* New setting `DATABASE_PATH`, default `data/app.db`.
* The four old settings stay readable **only** to find the old files for the one-time merge. They are removed from docs and compose.

### 4.2 One schema owner

`VehicleDatabase` becomes the owner of the whole schema (renaming it to `AppDatabase` is optional but recommended, since it no longer holds only vehicles):

* Its init creates **all** tables, vehicles plus users, certificates and insights, inside the `BEGIN IMMEDIATE` transaction it already uses. That fixes dry run A, because whoever opens the file first creates everything in one transaction.
* Every connection sets `foreign_keys = ON` and `busy_timeout = 5000` (already true in `VehicleDatabase.connection()`).
* On open it sets `journal_mode = WAL` (persistent in the file, so it only has to succeed once).
* Schema version goes to **11** ("single database"). Accepted on open: 0 (empty), 8, 9, 10 (old vehicle-only files, upgraded in place), 11.

### 4.3 Repositories use the shared database

`UserRepository`, `CertificateRepository` and `AdminInsightsRepository` stop creating tables and opening their own connections. They get connections from the shared database class.

* To keep test churn low, the existing constructors that take a `Path` can stay. They construct the database class for that path, and its init is idempotent.
* `UserRepository` is a Kotlin `object` that reads `USER_DB_PATH` on first touch. It switches to `DATABASE_PATH`.
* Their existing "add missing columns" helpers stay, so older merged files still get new columns.

### 4.4 Foreign keys

| Column | References | Safe because |
|---|---|---|
| `users.supplier_id` (nullable, null for admins) | `suppliers(id)` | suppliers are never hard-deleted |
| `supplier_invitations.supplier_id` | `suppliers(id)` | same |
| `access_invitations.supplier_id` (nullable) | `suppliers(id)` | same |
| `access_invitations.invited_by` | `users(id)` | users are never hard-deleted |
| `certificates.contract_id` (nullable) | `agreements(id)` | agreements are never hard-deleted; upload already rejects unknown agreements |
| `admin_alerts.supplier_id` (nullable) | `suppliers(id)` | suppliers never hard-deleted |
| `supplier_notes.supplier_id` | `suppliers(id)` | same |
| `supplier_notes.author_id` | `users(id)` | users never hard-deleted |
| `supplier_notes.alert_id` (nullable) | `admin_alerts(id)` | alerts are soft-deleted (`deleted` flag) |
| `supplier_review_statuses.supplier_id` | `suppliers(id)` | suppliers never hard-deleted |
| `supplier_review_statuses.updated_by` | `users(id)` | users never hard-deleted |
| `notifications.recipient_user_id` | `users(id)` | users never hard-deleted |
| `notifications.alert_id` | `admin_alerts(id)` | alerts are soft-deleted |

The hard deletes that do exist (certificates, pending invitations, some onboarding rows) are on tables nothing points at, so plain `REFERENCES` (no `ON DELETE` rule) is enough.

Not covered: `archived_by` and similar "who did it" columns. They were not checked for system actors, so they stay unlinked.

## 5. The one-time merge

### 5.1 When it runs

At startup, in `Application.kt`, **before** `UserRepository` is first touched (currently line 51):

| `app.db` | Old files | Action |
|---|---|---|
| missing | none | Fresh install: create `app.db`. |
| missing | present | Merge (5.2). |
| version 11 | still present (not yet renamed) | A previous merge finished but crashed before cleanup: only rename the old files. |
| version 11 | none | Normal start. |

### 5.2 Steps

1. Delete any leftover `app.db.tmp` (from a crashed earlier attempt).
2. If old `vehicles.db` exists, copy it to `app.db.tmp`; otherwise start from an empty `app.db.tmp`.
3. Open `app.db.tmp` with the shared database class. This upgrades version 8/9/10 vehicle columns, creates the new user, certificate and insight tables **from the code's DDL with foreign keys**, and sets WAL and version 11.
4. `ATTACH` each other old file **read-only** and, in one transaction with foreign keys deferred:
   * Copy each table by **explicit column names**, using the columns both sides have, parents before children: users, supplier_invitations, access_invitations, certificates, admin_alerts, admin_insights_metadata, supplier_notes, supplier_review_statuses, notifications. Old files may have their columns in a different order, because columns were added with `ALTER TABLE`, so `SELECT *` is not safe.
   * Compare row counts per table.
   * Run `PRAGMA foreign_key_check`. On any violation: roll back, log every violating table, row and parent, and stop startup with a message saying what to fix. The old files are not touched.
5. Commit, run `PRAGMA integrity_check`, close.
6. Rename `app.db.tmp` to `app.db` (atomic on the same filesystem).
7. Rename each old file to `<name>.pre-merge`, so it is kept as a backup but never read again. An old build would then see no files and start empty instead of silently running on stale data.
8. Log one line per table with its row count.

Steps 4–5 were prototyped as a Python script for dry run B. The real version belongs in Kotlin, for example a new `LegacyDatabaseMerge.kt` next to the database class.

### 5.3 Rollback

There is no in-place way back, because an older build refuses version 11. The rollback procedure is:

1. Stop the backend.
2. Rename the `.pre-merge` files back to their original names and remove `app.db`.
3. Start the previous build.

Anything written after the merge is lost. This is acceptable if the merge ships before there is production data that matters. **Confirm that before shipping.**

## 6. File-by-file changes

| File | Change |
|---|---|
| `backend/.../vehicles/VehicleDatabase.kt` | Own the full schema, WAL, version 11, accepted versions; optional rename to `AppDatabase`. |
| `backend/.../vehicles/FleetSchema.kt` (or a new schema file) | Add the user, certificate and insight `CREATE TABLE` statements with `REFERENCES`. |
| New `backend/.../LegacyDatabaseMerge.kt` | The one-time merge (section 5). |
| `backend/.../repository/UserRepository.kt` | Remove its DDL and `connection()`; use the shared database; read `DATABASE_PATH`. |
| `backend/.../certificates/CertificateRepository.kt` | Same. |
| `backend/.../admin/AdminInsightsRepository.kt` | Same. |
| `backend/.../Application.kt` | Resolve `DATABASE_PATH`, run the merge before line 51, pass one path to all repositories. |
| `backend/build.gradle.kts` (lines 69–72) | Test env: one `DATABASE_PATH` instead of four. |
| `docker-compose.yml` | Replace `CERTIFICATE_DB_PATH` and `USER_DB_PATH` with `DATABASE_PATH: /app/data/app.db`. Old files are found at their defaults in `/app/data`. |
| `.env.example`, `docs/configuration.md`, `backend/README.md`, `README.md` | Document `DATABASE_PATH`, the merge, backup and rollback. |
| `inspect_db.py`, `backend/scripts/reset-vehicle-data.ps1`, `scripts/tests/Backend-RootEnv.Smoke.ps1`, `BackendEnvironmentTest.kt` | Point at `app.db` / `DATABASE_PATH`. |

## 7. Tests

New:

* **Merge happy path**: four old files (vehicles at version 10) become one file at version 11, with all row counts equal, `foreign_key_check` empty and old files renamed to `.pre-merge`.
* **Merge from version 8/9**: vehicle columns upgraded and data merged.
* **Orphan aborts**: a user pointing at a missing supplier means startup fails, the old files are unchanged and no `app.db` exists.
* **Crash recovery**: a leftover `app.db.tmp` is discarded; a version-11 `app.db` with old files still present only renames them.
* **Fresh install**: no files gives one `app.db` at version 11 that works whichever repository opens first (regression test for dry run A).
* **Foreign keys enforced from every repository**: inserting a note, alert, invitation or certificate with an unknown supplier or agreement fails, which proves the pragma is on for the former insights and certificate connections.
* **Concurrency**: parallel admin dashboard reads (which write alerts) plus fleet writes produce no `SQLITE_BUSY` (regression test for dry run E).

Existing: 35 backend test files. 17 construct `VehicleRepository(path)`, 2 construct `CertificateRepository`, 1 constructs `AdminInsightsRepository` and 5 use `UserRepository`. If the `Path` constructors stay (4.3), most of them need no change beyond the Gradle test environment.

## 8. Operations

* **Backup**: stop the backend, then copy `app.db` together with any `app.db-wal` and `app.db-shm`. Copying only `app.db` while the backend runs can miss committed data that is still in the WAL file. An online backup (`VACUUM INTO` behind an admin action) can come later.
* **Backups are sensitive**: one file now contains password hashes and supplier data together. Store backups accordingly.
* **WAL needs a local filesystem.** The Docker named volume is fine; a network share is not.

## 9. Order of work and estimate

1. Close the stale-session gap now, without the merge. After `fleet.removeSupplier` succeeds, the fleet route also sets `access_expires_at = now` for that supplier's users (a new `UserRepository` method) and removes its pending invitations. Dry run G showed this blocks existing sessions on the next request. The two steps are in different files and not atomic: if the second one fails, fresh logins are still refused by the existing supplier-active check, but an old session keeps working until it expires. Step 4 replaces this with a single transaction.
2. Shared database class with full schema, WAL and version 11, plus repositories switched over (4.2–4.4). Fresh installs work from here.
3. One-time merge plus its tests (section 5, section 7).
4. Archive view, supplier reactivation and user blocking (section 10). This needs the merge first, because blocking users in the same transaction as a supplier removal only works in one file.
5. Config, compose, scripts and docs (section 6).
6. Rehearse on a copy of every real data volume that exists, then ship.

Rough estimate: 2–4 developer days for steps 2, 3 and 5 including tests, plus about 2–3 days for step 4 including the frontend. This is a guess from the file count and the dry runs, not a measured number.

## 10. Archived records and returning suppliers

### 10.1 Requirements (from the team)

* Nothing is deleted for good. A supplier, agreement, vehicle or any other record that is archived must stay in the system and be visible to admins, so they can see what happened in earlier years.
* A supplier whose contract ended may return years later with a new agreement. It must be possible to bring the same supplier back instead of creating a second one.
* When a supplier returns, its old user accounts stay blocked until an admin invites someone again.
* When an admin adds a supplier whose organization number belonged to an archived supplier, the system asks whether it is the same supplier.

### 10.2 What the code does today (verified by reading, not by running)

* Removal is already soft: `removeSupplier` sets `active = 0` and keeps all rows (`FleetRepository.kt:64-77`). `removeAgreement` and `removeVehicle` do the same (`active = 0`, `listed = 0`).
* A returning supplier is blocked at every step:
  * Adding the supplier again fails with "This organization number already belongs to a supplier", because the check counts archived suppliers too (`FleetRepository.kt:44`).
  * Editing one fails (`requireActive`), and so does creating an agreement for one (`saveAgreement`).
  * The only way back is undoing the removal, and undo is refused once later changes exist.
* There is no way to browse archived records. The fleet overview only returns `active = 1` suppliers and agreements (`FleetRepository.kt:25-26`). Archived suppliers show up only as lines in the change history.
* A removed supplier's users are untouched by removal. They are blocked only because the login and onboarding checks look at the supplier's `active` flag, so reactivating the supplier would silently let them log in again.
* Some hard deletes exist: certificates, pending invitations, and onboarding energy and product rows. The certificate delete is a deliberate admin action, not cleanup: `DELETE /api/certificates/{id}` (`CertificateRoutes.kt:200`), a frontend `deleteCertificate` function (`api/certificates.ts:91`) and a route test. Certificates can also be archived, so the delete bypasses the archive. Each of these needs a decision against the rule above.

### 10.3 Design

**Rule.** Suppliers, agreements, vehicles and users are never hard-deleted. This also keeps every foreign key in section 4.4 valid.

**Archive view (admin only).**
* New `GET /api/vehicle-fleet/archive` returns archived suppliers with their old agreements, vehicles and the date the supplier was removed (from its "Removed supplier" entry in the change history). Certificates, alerts and notes for a supplier are read with the existing endpoints.
* The frontend gets an "Archived suppliers" list next to the active one. The normal screens stay as they are.
* Delisted vehicles and archived agreements are shown with an "archived" label inside their supplier's page.

**Reactivating a supplier.**
* New `POST /api/vehicle-fleet/suppliers/{id}/reactivate` with `expectedUpdatedAt`, like the other fleet actions. It sets `active = 1`, is written to the change history (so it can be undone) and is rejected if the supplier is already active.
* Old agreements and vehicles stay archived. The admin creates a new agreement, which keeps the earlier contract period as history.

**"Is this the same supplier?"**
* When an admin adds a new supplier and the organization number matches an archived supplier, the API answers `409` with a structured body, `{ code: "ARCHIVED_SUPPLIER_MATCH", supplier: { id, name, orgNumber, archivedAt, agreementCount } }`, instead of the plain text error. An active supplier with that number keeps the existing error.
* The form shows: "This organization number belonged to *<name>*, archived on *<date>* after *<n>* agreements. Is this the same supplier?" with the buttons **Yes, reactivate** and **No, check the number**. The number is unique, so "No" returns to the form and the admin must correct it.
* Optional, non-blocking: if the name equals an archived supplier's name (ignoring case) but the number differs, show the same question as a warning. This catches typos in the number.

**Blocking old users until a re-invite.**
* No new column is needed. The code already has this mechanism: `users.access_expires_at`. `Security.validate` runs on every authenticated request and rejects any non-permanent user whose access has ended (`Security.kt:37`, `UserRepository.isAccessActive`), and `revokeAccess` blocks an account by setting `access_expires_at` to now (`UserRepository.kt:455`).
* When a supplier is removed, in the same transaction, set `access_expires_at = now` for all that supplier's `SUPPLIER` users and delete the supplier's pending invitations. Their sessions stop working on the next request, with no need to touch `token_version`.
* That also closes the stale-session gap on `/api/supplier/alerts` found earlier, because `validate` runs before that route. The cause of the gap is that removal never touched the users, so nothing else rejected them.
* Reactivating the supplier does **not** touch users, so they stay blocked.
* Re-invite: today inviting an email that already has an account returns `409 An account already exists` (`UserRepository.kt:273` and `:350`). Inviting the email of a blocked user of the same supplier must instead reuse the account: on acceptance, clear `access_expires_at` and set the new password, which already bumps `token_version` (`UserRepository.kt:560-563`). A different email creates a new user. Old blocked users stay for history, and other tables still point at them.

### 10.4 Migration impact

* No schema change for blocking users.
* The merge must backfill it. Users of suppliers that are already archived when the merge runs get `access_expires_at` set (to the merge time, unless they already have an earlier date), because they are only blocked today by the supplier's flag. That protection would end when the supplier is reactivated.

### 10.5 Tests

* Removing a supplier sets `access_expires_at` on its users and removes pending invitations, all in one transaction. A failure halfway leaves nothing changed. A session from before the removal gets `401` on `/api/supplier/alerts`.
* Reactivation leaves users blocked. Re-inviting the same email reuses that account, and inviting a new email creates a new user.
* Adding a supplier with an archived organization number returns the structured `409`. With an active number it returns the old error.
* The archive endpoint lists archived suppliers with their agreements and vehicles, and is admin only.
* Undo of a reactivation restores the archived state.
* The merge backfills `access_expires_at` for users of already-archived suppliers.

## 11. Out of scope (follow-ups)

* The copied `supplier_name` on invitations and certificates could be dropped and looked up by id. Today the copies are kept current on rename instead (13.3).
* The shared-vehicle work (13.5) still shares trip rows and registry snapshots per vehicle; making those per agreement would be a further change.

## 12. Open questions

* Is there any deployed data volume today? If so, it has to be rehearsed (step 6 of section 9) and the rollback limits (5.3) accepted.
* ~~Should the admin certificate delete be removed or turned into an archive?~~ Decided: it archives (13.3).
* Should a deactivated user's email be reusable for a different supplier? The plan keeps today's `409` until decided.
* Keep the name `app.db`, or keep `vehicles.db` as the merged file to avoid a rename? This plan uses `app.db` because the old name would no longer describe the contents.

## 13. As built

### 13.1 Differences from the plan

| Plan | Built | Why |
|---|---|---|
| One schema class (`VehicleDatabase`) creates every table (4.2) | Each repository keeps its own `CREATE TABLE`. The account tables moved to `UserSchema.kt` so the merge can create them. A helper `Connection.link(table)` adds `REFERENCES` only if the file has a `suppliers` table. | Much smaller change, and the 35 existing test files, which give each repository its own file, needed no rewrite. `Application` creates the vehicle schema first, so the real file always gets the keys. Tests that use separate files get none. |
| Schema version 11 (4.2) | Version stays 10. A row `legacy_merge` in `admin_insights_metadata` marks a finished merge. | The marker is what the "finished but not renamed" recovery needs, and an old build is not pointed at `app.db` anyway. |
| WAL set by the database class | `Application` turns on WAL for the real file only, never for injected test repositories. | Keeps test files unchanged. |
| Foreign key and busy timeout on every connection (4.2) | The certificate and alert repositories now open connections with `foreign_keys=true&busy_timeout=5000`. | They had neither. |
| Step 1: interim fix without the merge (9) | Skipped. Step 4 does it in one transaction. | The steps were done together, so a throwaway interim fix had no value. |
| Re-invite reuses the account (10.3) | Done for the admin's "invite contact" route. A colleague invitation (`createAccessInvitation`) still answers `409` for an existing account. | Only the admin route is needed to bring a returning supplier back. |
| Test settings | Gradle sets one `DATABASE_PATH` instead of four paths. | One setting now. |

### 13.2 Smaller changes made on the way

* A note's `alertId` is now checked to exist (`AdminInsightsRepository.alertExists`, which also finds archived alerts) and answers `400` otherwise. With a foreign key it would have been a `500`. One existing test posted a note for a made-up alert; it now uses a real one and asserts the `400`.
* `VehicleDatabase` no longer calls a file "not empty" when the only tables in it belong to the other repositories.
* `BodyLimitTest` uses its own vehicle file so the shared default test file never gets a `suppliers` table. Otherwise whether the shared test file had keys would depend on which test ran first.
* `backend/scripts/reset-vehicle-data.ps1` now deletes `app.db`, which resets accounts, certificates and alerts too. The docs and the script say so.
* Removing a supplier shows an updated confirmation text: accounts are blocked, and undo does not unblock them.

### 13.3 Done since the first build

* **Name warning:** adding a supplier whose name matches an archived one (different number) answers `409` `ARCHIVED_SUPPLIER_NAME_MATCH`; the admin chooses "reactivate" or "no, create a new supplier" (`confirmNewSupplier`). An organization-number match still wins.
* **Certificate delete is archive:** `DELETE /api/certificates/{id}` archives (nothing is destroyed) and the hard-delete method is gone. The unused `deleteCertificate` client function is gone too.
* **Colleague invitations:** a colleague whose access was removed can be invited again, by the supplier or by an admin, and keeps the same account (same rule as the admin "invite contact" route). An active account and an account of another organization still get `409`.
* **Renamed suppliers:** the copies of the name on invitations and on certificates tied to an agreement follow a rename in the same transaction, and the merge brings old copies up to date. A certificate without an agreement has a free-text name and is left alone.
* **Shared vehicles:** see 13.5.

### 13.3b Known limits

* **Undo does not unblock accounts.** Undoing a supplier removal restores the supplier but not its blocked users. An admin invites a contact again, and the same account is reused.
* **`archived_by` columns** have no foreign key. Checked: they are only ever written with a real user id, so a key would be safe. It would only reach new files, though: the column is added with `ALTER TABLE` in files that already exist, and merged files are built fresh. Left out until it is wanted.
* **Rehearsal on real data:** done on copies, not on a live volume. The Docker volume `tdt4290-group7_vehicle-backend-data` on this machine (four files, `vehicles.db` at version 10, 1 supplier, 1 agreement, 1 vehicle, 1 check) merged cleanly: counts matched, `foreign_key_check` and `integrity_check` were clean, WAL was on. The local `backend/data/vehicles.db` is schema version 6, which the backend already refused before this change; the merge also refuses it and changes nothing, and the error names that file.
* **Rollback after the vehicle change:** the file is schema version 11, so an older build refuses it. Rolling back means restoring the `*.pre-merge` files (merge) or a backup (later changes).
* **Trip rows and registry snapshots** stay per vehicle, not per agreement: they describe the truck. Checks, alerts and contract details are per agreement.
* **Opening a vehicle from other pages** (risk, contracts, supplier drawers) passes only the plate, so a shared truck opens on its best-fitting agreement; from the Vehicles page it opens on the agreement it was clicked under.
* **Not done:** a live upgrade of the running container; foreign keys on `archived_by`.

### 13.4 Verification

* Backend tests: 221 pass (200 before this work), run from a clean state. Frontend tests: 213 pass (207 before), and the TypeScript build is clean.
* End to end on the real backend, started on four seeded old files: the merge ran by itself, the old files became `*.pre-merge`, WAL and the foreign keys were on, and the users of the two already-archived suppliers came out blocked. 31 checks then passed across every area, including: a live supplier session ending on the next request after removal; the archive list; the `409` "same supplier?" answer; reactivation leaving old accounts blocked; the re-invite reusing the same account; and 240 concurrent requests with no server errors. A restart did not merge again, and `foreign_key_check` and `integrity_check` were clean.

* **Container.** `docker compose build` built both images. The new backend image, started with the compose hardening (read-only filesystem, all capabilities dropped, no new privileges) on a copy of the data from the existing Docker volume, merged the four old files by itself, upgraded `vehicles.db` from version 10 to 11 (the existing listing was copied to `vehicle_usages`), ran in WAL mode, answered `/health`, and left `foreign_key_check` and `integrity_check` clean. The running containers and the real volume were not touched.
* **Shared truck end to end** on the real backend, after the merge and the 10 to 11 upgrade of a seeded install: the same plate listed under two suppliers; a check per agreement; per-agreement details; the supplier's own list showing only its listing; removal needing the agreement; the other supplier's listing untouched; then the earlier 31-check run again on the same file, still all passing.

### 13.5 Shared vehicles, as built

* **Model.** `vehicles` keeps one row per truck (the registration number, with its registry data, trip rows and checks pointing at it). New table `vehicle_usages` has one row per truck and agreement (`id` is `plate|agreementId`), and is the table that is listed, counted, changed and put in the change history (`change_vehicle_usages`). Contract details moved to `vehicle_usage_details`, keyed by usage. The old columns on `vehicles` (`agreement_id`, `listed`) are frozen and no longer read.
* **Upgrade.** Schema version 11. On start, existing listings, their change history and their contract details are copied to the new tables. Repeating the copy changes nothing, so later changes are never undone.
* **Rules.** A truck is listed once per agreement; listing it under another agreement, also another supplier's, is allowed. Each listing counts against its own agreement's allowance. Removing or replacing names the agreement; with several listings and no `agreementId` the API answers `400`.
* **Checks.** A check is made for one agreement (`agreementId`, otherwise the best fit). Alerts come from the latest check of each listing's own agreement, so one supplier's finding is never shown to another. A listing with no check of its own falls back to the truck's earlier checks only when it has just one listing.
* **Supplier view.** A supplier's vehicle list, counts and imports use only the listings under its own agreements. A CSV import of a truck another supplier already uses creates the importing supplier's own listing and details, and no longer fails with "already assigned to another supplier".
* **Tests.** 5 new backend tests (rules, best fit, routes, alerts, upgrade) plus 4 updated ones that encoded the old one-agreement rule; 1 new frontend test.
