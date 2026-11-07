# Base images are pinned by digest so a rebuild can't silently pull a different image. The tag
# is kept for readability; to update, look up the tag's new digest and bump both together.
FROM gradle:9.8.2-jdk21@sha256:85f8f572045bfb31874d66d7d8a2bd0c17d8cb9ad34b6a4d02f5d552b4b92c04 AS build
WORKDIR /app
COPY . .
RUN sed -i 's/\r$//' gradlew && ./gradlew buildFatJar --no-daemon

FROM eclipse-temurin:25-jre-alpine@sha256:b7528962e65d43064d8a8b67ba175367896bc948363ea2d3fcd7f10d34e1f048
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
