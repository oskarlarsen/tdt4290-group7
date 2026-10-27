package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertFailsWith

class BackendEnvironmentTest {
    @Test
    fun cacheTtlAcceptsPositiveDaysIncludingTheDurationBoundary() {
        val maximumDays = Long.MAX_VALUE / 86_400

        for (days in listOf(1L, 14L, 30L, maximumDays)) {
            assertEquals(days, svvCacheTtlDays(days.toString()))
            assertEquals(Duration.ofDays(days), Duration.ofDays(svvCacheTtlDays(days.toString())))
        }
    }

    @Test
    fun invalidOrOversizedCacheTtlFallsBackWithoutOverflowing() {
        val firstOverflowingDays = Long.MAX_VALUE / 86_400 + 1
        val invalidValues = listOf(
            null, "", "invalid", "14.5", "0", "-1",
            firstOverflowingDays.toString(), Long.MAX_VALUE.toString(), "9223372036854775808",
        )

        for (value in invalidValues) {
            val days = svvCacheTtlDays(value)
            assertEquals(14L, days, "TTL setting: $value")
            assertEquals(Duration.ofDays(14), Duration.ofDays(days))
        }
    }

    @Test
    fun readsLocalKeyAndLetsProcessEnvironmentOverrideIt() {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.env")
        Files.createDirectories(path.parent)
        Files.writeString(path, "# local development key\nSVV_API_KEY=local-test-key\n")

        assertEquals("local-test-key", backendSetting("SVV_API_KEY", emptyMap(), path))
        assertEquals(
            "deployed-test-key",
            backendSetting("SVV_API_KEY", mapOf("SVV_API_KEY" to "deployed-test-key"), path),
        )
    }

    @Test
    fun blankOrMissingKeyDisablesLiveRegistryChecks() {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.env")
        Files.createDirectories(path.parent)
        Files.writeString(path, "SVV_API_KEY=\n")

        assertNull(backendSetting("SVV_API_KEY", emptyMap(), path))
        assertNull(backendSetting("SVV_API_KEY", emptyMap(), path.resolveSibling("missing.env")))
    }
    @Test
    fun explicitBlankProcessValueDisablesFileSettingWithoutTrimmingPasswords() {
        val path = fixture("SVV_API_KEY=synthetic-file-key\n")
        assertNull(backendSetting("SVV_API_KEY", mapOf("SVV_API_KEY" to ""), path))
        assertEquals(" synthetic password ", backendSetting("SEED_ADMIN_PASSWORD", mapOf("SEED_ADMIN_PASSWORD" to " synthetic password "), path))
    }

    @Test
    fun rootFileIsDiscoveredFromRootAndBackendWithoutReadingLegacyFile() {
        val root = Path.of("build", "test-data", UUID.randomUUID().toString()).toAbsolutePath()
        Files.createDirectories(root.resolve("backend"))
        Files.writeString(root.resolve("docker-compose.yml"), "services: {}\n")
        Files.writeString(root.resolve(".env.example"), "JWT_SECRET=\n")
        Files.writeString(root.resolve(".env"), "JWT_SECRET=synthetic-root-secret\n")
        Files.writeString(root.resolve("backend/.env"), "JWT_SECRET=synthetic-retired-secret\n")
        for (directory in listOf(root, root.resolve("backend"))) {
            assertEquals(root.resolve(".env"), rootEnvFile(emptyMap(), directory))
            assertEquals("synthetic-root-secret", backendSetting("JWT_SECRET", emptyMap(), rootEnvFile(emptyMap(), directory)))
        }
        assertEquals(root.resolve("isolated.env"), rootEnvFile(mapOf("BACKEND_ENV_FILE" to "../isolated.env"), root.resolve("backend")))
        assertEquals(root.resolve("isolated.env"), rootEnvFile(mapOf("BACKEND_ENV_FILE" to root.resolve("isolated.env").toString()), root))
    }

    @Test
    fun portableQuotedSettingsPreserveLiteralSecretsAndSupportComments() {
        val path = fixture("""
            JWT_SECRET='synthetic ${'$'}value # literal' # explanation
            SEED_ADMIN_PASSWORD=" synthetic password "
            SEED_SUPPLIER_PASSWORD=synthetic-password # explanation
            TESSERACT_PATH='C:\Program Files\Tesseract-OCR\tesseract.exe'
            JWT_ISSUER="line\nsecond"
            JWT_AUDIENCE='${'$'}{JWT_ISSUER}'
        """.trimIndent())
        assertEquals("synthetic ${'$'}value # literal", backendSetting("JWT_SECRET", emptyMap(), path))
        assertEquals(" synthetic password ", backendSetting("SEED_ADMIN_PASSWORD", emptyMap(), path))
        assertEquals("synthetic-password", backendSetting("SEED_SUPPLIER_PASSWORD", emptyMap(), path))
        assertEquals("C:\\Program Files\\Tesseract-OCR\\tesseract.exe", backendSetting("TESSERACT_PATH", emptyMap(), path))
        assertEquals("line\nsecond", backendSetting("JWT_ISSUER", emptyMap(), path))
        assertEquals("${'$'}{JWT_ISSUER}", backendSetting("JWT_AUDIENCE", emptyMap(), path))
    }

    @Test
    fun invalidQuotesFailWithoutPuttingTheValueInAnError() {
        for (raw in listOf("'synthetic-sensitive-value", "'synthetic-sensitive-value' garbage")) {
            val error = assertFailsWith<IllegalArgumentException> { backendSetting("JWT_SECRET", emptyMap(), fixture("JWT_SECRET=$raw\n")) }
            kotlin.test.assertFalse(error.message.orEmpty().contains("synthetic-sensitive-value"))
        }
        assertNull(backendSetting("JWT_SECRET", emptyMap(), fixture("JWT_SECRET\n")))
    }

    private fun fixture(content: String): Path {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.env")
        Files.createDirectories(path.parent)
        Files.writeString(path, content)
        return path
    }
}
