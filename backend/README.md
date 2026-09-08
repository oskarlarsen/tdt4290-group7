# Backend

Kotlin/Ktor backend service.

## Prerequisites

- JDK 25 (Eclipse Temurin, Amazon Corretto, or Azul Zulu)
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
