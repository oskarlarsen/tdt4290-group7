plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.plugin.serialization)
    alias(libs.plugins.ktor)
    application
}

group = "com.tdt4290group7"
version = "0.0.1"

application {
    mainClass.set("com.tdt4290group7.backend.ApplicationKt")

    val isDevelopment: Boolean = project.ext.has("development")
    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=$isDevelopment")
}

tasks.register<JavaExec>("runCertificateParser") {
    group = "application"
    description = "Extract and parse a certificate PDF"
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.tdt4290group7.backend.certificates.CertificateParserRunnerKt")
}

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(21)
}

dependencies {
    implementation("io.ktor:ktor-server-core")
    implementation("io.ktor:ktor-server-netty")
    implementation("io.ktor:ktor-server-content-negotiation")
    implementation("io.ktor:ktor-serialization-kotlinx-json")
    implementation("io.ktor:ktor-server-cors")
    implementation("io.ktor:ktor-server-call-logging")
    implementation("io.ktor:ktor-server-status-pages")
    implementation("org.xerial:sqlite-jdbc:3.53.4.0")
    implementation("io.ktor:ktor-server-auth")
    implementation("io.ktor:ktor-server-auth-jwt")
    implementation("io.ktor:ktor-server-rate-limit")
    implementation("io.ktor:ktor-server-forwarded-header")
    implementation("io.ktor:ktor-server-body-limit")
    implementation("at.favre.lib:bcrypt:0.10.2")
    implementation(libs.logback.classic)
    implementation(libs.pdfbox)
    testImplementation("io.ktor:ktor-server-test-host")
    testImplementation(kotlin("test"))
}

tasks.test {
    // Never read the developer's shared .env, SVV key or data-path overrides in tests.
    environment("BACKEND_ENV_FILE", layout.buildDirectory.file("test-data/no-local-config.env").get().asFile.absolutePath)
    environment("SVV_API_KEY", "")
    // The app refuses to start without these; tests get throwaway values that never ship.
    environment("JWT_SECRET", "test-only-jwt-secret")
    environment("SEED_ADMIN_PASSWORD", "test-only-admin-password")
    environment("SEED_SUPPLIER_PASSWORD", "test-only-supplier-password")
    // Auth tests now initialize the vehicle store too; keep them away from local vehicle data.
    environment("VEHICLE_DB_PATH", layout.buildDirectory.file("test-data/default-vehicles-v6.db").get().asFile.absolutePath)
}
