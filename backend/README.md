# Backend

Kotlin/Ktor backend service.

## Prerequisites

- JDK 25 (Eclipse Temurin, Amazon Corretto, or Azul Zulu)
- Docker or Rancher Desktop (only needed for the container option below)
- A Statens vegvesen Enkeltoppslag API key only for live registry checks; imports and approved-list comparison work without one

## Local API key

From `backend/`, edit the existing ignored `.env` file (or copy `.env.example` to `.env` if it is absent):

```dotenv
SVV_API_KEY=your-private-key-here
```

The backend reads this file at startup from its working directory. An `SVV_API_KEY` process environment variable takes precedence, which is useful in deployment. Leave the value blank to run without live registry checks. Never put the key in frontend/Vite configuration, a request body, or Git. `.env` is Git-ignored and excluded from the Docker build context; `.env.example` contains no secret and may be committed. Restart the server after changing `.env`.

## Run locally with Gradle

From the `backend/` folder:

```powershell
.\gradlew.bat run
```

The server starts on [http://localhost:8080](http://localhost:8080). Stop it with `Ctrl+C`.

By default the server listens only on `127.0.0.1`. Set `HOST=0.0.0.0` only when you intentionally need network access (the Docker image does this for port publishing). These development endpoints do not yet have authentication: **do not expose them publicly or import NDA/client data until authentication, authorization and a retention policy are in place.**

By default it listens on port `8080`; override with the `PORT` environment variable:

```powershell
$env:PORT = "9000"
.\gradlew.bat run
```

### Verify it's working

```powershell
Invoke-RestMethod http://localhost:8080/health
# {"status":"UP"}
```

### Run tests

```powershell
.\gradlew.bat test
```

## Run locally with Docker

Build the image:

```powershell
docker build -t ktor-backend .
```

Run the container:

```powershell
docker run --env-file .env -p 8080:8080 ktor-backend
```

Verify:

```powershell
Invoke-RestMethod http://localhost:8080/health
# {"status":"UP"}
```

## Trip imports, approved vehicles, and registry checks (development)

The backend stores JSON imports in SQLite at `data/vehicles.db` by default. Override the location with `VEHICLE_DB_PATH`. The database directory is Git-ignored. Keep backups and access control in mind if using non-synthetic data.

Trip/job statistics and the approved-vehicle list are **separate imports**. Trip rows are stored independently, even when several rows share a registration number. Values such as `medianCo2` and consumption are stored as supplied; the backend does not infer units or make CO2/fuel compliance decisions. `additionalFields` can retain spreadsheet columns not yet mapped to named fields. The frontend converts spreadsheet dates to ISO `yyyy-MM-dd` and `Ja`/`Nei` to JSON booleans before sending approved rows.

```http
POST /api/vehicle-imports
Content-Type: application/json

{
  "sourceName": "bus-trips-demo",
  "rows": [
    {
      "registrationNumber": "AB 12345",
      "fuel": "Diesel",
      "assignmentNumber": "A-1",
      "tripCount": "3",
      "kmPerBus": "45.5",
      "averageConsumptionLitresPerKm": "0.31"
    },
    {
      "registrationNumber": "AB12345",
      "assignmentNumber": "A-2",
      "tripCount": "7"
    }
  ]
}
```

The response provides an import ID. Read it with `GET /api/vehicle-imports/{id}` and its preserved rows with `GET /api/vehicle-imports/{id}/rows`.

```http
POST /api/approved-vehicle-imports
Content-Type: application/json

{
  "sourceName": "approved-fleet-demo",
  "rows": [
    {
      "registrationNumber": "AB12345",
      "fuelTechnology": "Elektrisk/Hydrogen",
      "usedThroughoutPeriod": true,
      "vehicleGroup": "under 7.5 tonnes or up to 8 passengers"
    },
    {
      "registrationNumber": "EF67890",
      "fuelTechnology": "Fossil",
      "usedThroughoutPeriod": false,
      "startDate": "2024-04-01",
      "endDate": "2024-12-31"
    }
  ]
}
```

Read the approved import with `GET /api/approved-vehicle-imports/{id}` and its rows with `GET /api/approved-vehicle-imports/{id}/rows`. Neither the dates nor the fuel category currently trigger deviations.

Compare one trip import to one approved import with `POST /api/vehicle-comparisons`:

```json
{"tripImportId":"<trip import ID>","approvedImportId":"<approved import ID>"}
```

The response reports each distinct registration number used in trips as `ON_APPROVED_LIST` or `NOT_ON_APPROVED_LIST`, with IDs of all matching trip rows and approved rows. `ON_APPROVED_LIST` means only that the number is present, not that use on a particular date was authorized. Duplicate trip rows keep their separate statistics. The comparison is saved; retrieve it using `GET /api/vehicle-comparisons/{id}`. This comparison does **not** need a Vegvesen API key. The caller must select imports for the same supplier/contract and period; those scopes are not yet modeled or inferred.

Set `SVV_API_KEY` on the backend process to enable `POST /api/vehicle-imports/{id}/checks` for a trip import. The key is sent only in the `SVV-Authorization` header to Statens vegvesen's Enkeltoppslag API; never put it in frontend code or the repository. The check looks up each distinct normalized registration number once, stores the complete registry response as a lossless application-owned value tree in SQLite, and returns status-based results. `GET /api/vehicle-imports/{id}/checks/latest` retrieves the latest run. Full registry snapshots are intentionally not exposed through an unauthenticated endpoint.

Registry checks currently flag only `AVREGISTRERT`, `UTFORT`, `VRAKET`, `UREGISTRERT`, or an unknown registration status. A failed lookup is reported separately and never treated as compliant. The public API does not expose current use prohibitions (`bruksforbud`), so `usageProhibitionState` is always `UNKNOWN`. Registry checks and approved-list comparisons are separate runs; the frontend can display both sets of results for the selected trip import.
