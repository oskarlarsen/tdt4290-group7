# Backend

Kotlin/Ktor API for authentication, vehicle agreements, reported statistics, Statens vegvesen checks and administrator certificate uploads. Vehicle and certificate metadata are stored in SQLite; uploaded PDFs are processed and discarded.

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
- Certificate metadata is stored beside the vehicle database in a `*-certificates.db` file. Uploads require an admin session; only extracted metadata is retained.
- Authentication accounts are seeded in memory. Restarting restores the configured account passwords and requires signing in again.
- The registry key enables live Statens vegvesen requests. Adding/replacing registered vehicles requires a successful live lookup; planned entries do not.
- Dashboard, supplier-directory and contract demo data are frontend features. There are no backend APIs for the placeholder screens.

If an existing vehicle database is incompatible, preserve it and configure another path; see [configuration and troubleshooting](../docs/configuration.md#troubleshooting).

## Reference

- [API](../docs/api.md): authentication, fleet management, certificates, statistics and checks.
- [Configuration](../docs/configuration.md): environment options and startup troubleshooting.
- [Certificate parser](../docs/certificate-parser.md): PDF extraction, Tesseract and parser commands.

Main code is under [`src/main/kotlin/com/tdt4290group7/backend/`](src/main/kotlin/com/tdt4290group7/backend/): `routes/` handles authentication, `vehicles/` contains the fleet and registry workflows, and `certificates/` plus `pdf/` contain document processing. Tests are under [`src/test/`](src/test/).
