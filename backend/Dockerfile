FROM gradle:9.7.1-jdk21 AS build
WORKDIR /app
COPY . .
RUN ./gradlew buildFatJar --no-daemon

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/build/libs/*-all.jar app.jar
EXPOSE 8080
ENV HOST=0.0.0.0
ENTRYPOINT ["java", "-jar", "app.jar"]
