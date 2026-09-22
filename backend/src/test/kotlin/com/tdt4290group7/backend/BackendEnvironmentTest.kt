package com.tdt4290group7.backend

import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class BackendEnvironmentTest {
    @Test
    fun readsLocalKeyAndLetsProcessEnvironmentOverrideIt() {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.env")
        Files.createDirectories(path.parent)
        Files.writeString(path, "# local development key\nSVV_API_KEY=local-test-key\n")

        assertEquals("local-test-key", svvApiKey(emptyMap(), path))
        assertEquals("deployed-test-key", svvApiKey(mapOf("SVV_API_KEY" to "deployed-test-key"), path))
    }

    @Test
    fun blankOrMissingKeyDisablesLiveRegistryChecks() {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.env")
        Files.createDirectories(path.parent)
        Files.writeString(path, "SVV_API_KEY=\n")

        assertNull(svvApiKey(emptyMap(), path))
        assertNull(svvApiKey(emptyMap(), path.resolveSibling("missing.env")))
    }
}
