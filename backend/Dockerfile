# Base images are pinned by digest so a rebuild can't silently pull a different image. The tag
# is kept for readability; to update, look up the tag's new digest and bump both together.
FROM gradle:9.8.0-jdk21@sha256:4debe478645a3ad9208f3403ac021859fdf4d1a819d59970d75309b098f28f76 AS build
WORKDIR /app
COPY . .
RUN ./gradlewhttps://github.com/oskarlarsen/tdt4290-group7 buildFatJar --no-daemon

FROM eclipse-temurin:25-jre-alpine@sha256:3c0a9084927a221ccd1d007fcaf614465672c0af37aaa834c5184483afe56d61
# Run as an unprivileged user; the app only needs to read its jar and bind 8080.
RUN addgroup -S app && adduser -S -G app -H -s /sbin/nologin app
WORKDIR /app
RUN mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/build/libs/*-all.jar app.jar
USER app
EXPOSE 8080
ENV HOST=0.0.0.0
ENTRYPOINT ["java", "-jar", "app.jar"]
