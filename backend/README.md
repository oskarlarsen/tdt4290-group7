# Backend

Kotlin/Ktor API for authentication, vehicle agreements, supplier service-contract onboarding, reported statistics, Statens vegvesen checks and administrator certificate uploads. Fleet and service-contract records, and certificate metadata, are stored in SQLite; uploaded PDFs are processed and discarded.

Follow the [project setup](../README.md#run-locally) for JDK 21, root `.env` configuration and startup. The [Docker instructions](../README.md#run-with-docker) run both services together.

## Development commands

Run these from `backend/`. No separate Gradle installation is needed.

| Task | PowerShell | macOS |
|---|---|---|
| Start API | `.\gradlew.bat run` | `./gradlew run` |
| Run tests | `.\gradlew.bat test` | `./gradlew test` |
| Package executable JAR | `.\gradlew.bat buildFatJar` | `./gradlew buildFatJar` |

Tests use synthetic configuration and isolated databases. They do not use your configured registry key or development database.

## Certificate sample generator

Generate synthetic certificate PDFs for local parser testing from `backend/`:

```powershell
.\gradlew.bat runCertificateGenerator
.\gradlew.bat runCertificateGenerator --args="20 4290"
```

The optional arguments set the sample count (1–60) and seed; reusing a seed reproduces the same samples. Files are written under `build/generated-certificate-samples/`. They are clearly marked as invalid test documents and contain no real certificate data.

## Storage and integrations

- Native startup from `backend/` creates `data/vehicles.db`; Docker uses a persistent volume. Suppliers, agreements, statistics, checks and change history survive restarts.
- Supplier service contracts are stored with fleet data in `vehicles.db`. The `procurement_contracts` table is created additively on startup, including for existing version-8 databases.
- Certificate metadata is stored in its own SQLite database at `data/certificates.db` by default, independent of the vehicle database. Set `CERTIFICATE_DB_PATH` to choose another location. Uploads require an admin session and an active imported contract; only extracted metadata is retained.
- Authentication accounts are seeded in memory. Restarting restores the configured account passwords and requires signing in again.
- The registry key enables live Statens vegvesen requests. Adding/replacing registered vehicles requires a successful live lookup; planned entries do not.
- Dashboard risk metrics, supplier-directory details and contract compliance demo data are frontend features. Imported service contracts are exposed separately and do not yet populate those demo metrics.

If an existing vehicle database is incompatible, preserve it and configure another path; see [configuration and troubleshooting](../docs/configuration.md#troubleshooting).

## Reference

- [API](../docs/api.md): authentication, fleet management, certificates, statistics and checks.
- [Configuration](../docs/configuration.md): environment options and startup troubleshooting.
- [Certificate parser](../docs/certificate-parser.md): PDF extraction, Tesseract and parser commands.

Main code is under [`src/main/kotlin/com/tdt4290group7/backend/`](src/main/kotlin/com/tdt4290group7/backend/): `routes/` handles authentication, `vehicles/` contains the fleet and registry workflows, and `certificates/` plus `pdf/` contain document processing. Tests are under [`src/test/`](src/test/).
