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
    // The app refuses to start without these; tests get throwaway values that never ship.
    environment("JWT_SECRET", "test-only-jwt-secret")
    environment("SEED_ADMIN_PASSWORD", "test-only-admin-password")
    environment("SEED_SUPPLIER_PASSWORD", "test-only-supplier-password")
}
