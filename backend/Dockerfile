# Base images are pinned by digest so a rebuild can't silently pull a different image. The tag
# is kept for readability; to update, look up the tag's new digest and bump both together.
FROM gradle:9.7.1-jdk21@sha256:3695cd3c4b617ccb7b351ff1481c0f141c5e87a89872dc8ca1e5a8eeac6a85e3 AS build
WORKDIR /app
COPY . .
RUN ./gradlew buildFatJar --no-daemon

FROM eclipse-temurin:21-jre-alpine@sha256:1a29e1fe337eb28b5bec30f0ee8ed29f0ff80ab6f75dcf9313efe82911065a52
# Run as an unprivileged user, with a writable directory for the SQLite data volume.
RUN addgroup -S app && adduser -S -G app -H -s /sbin/nologin app
WORKDIR /app
RUN mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/build/libs/*-all.jar app.jar
USER app
EXPOSE 8080
ENV HOST=0.0.0.0
ENTRYPOINT ["java", "-jar", "app.jar"]
