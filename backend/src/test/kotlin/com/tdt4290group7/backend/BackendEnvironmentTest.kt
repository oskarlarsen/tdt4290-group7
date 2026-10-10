package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

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
}
