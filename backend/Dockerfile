# Base images are pinned by digest so a rebuild can't silently pull a different image. The tag
# is kept for readability; to update, look up the tag's new digest and bump both together.
FROM gradle:9.9.1-jdk21@sha256:607055593f1acc874a98aa7c1cb5adb414b3879bb0a5e1e7240180020fb97277 AS build
WORKDIR /app
COPY . .
RUN sed -i 's/\r$//' gradlew && ./gradlew buildFatJar --no-daemon

FROM eclipse-temurin:25-jre-alpine@sha256:e1898fd6a11fc965a994d8ace186fd3585aeb636cf8f05f47a723fcfee0b0918
# Run as an unprivileged user; the app only needs to read its jar and bind 8080.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-nor \
    && addgroup -S app \
    && adduser -S -G app -H -s /sbin/nologin app
WORKDIR /app
RUN mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/build/libs/*-all.jar app.jar
USER app
EXPOSE 8080
ENV HOST=0.0.0.0
# SQLite JDBC loads a native library; /tmp is mounted noexec by Compose.
ENTRYPOINT ["java", "-Dorg.sqlite.tmpdir=/app/data", "-jar", "app.jar"]
