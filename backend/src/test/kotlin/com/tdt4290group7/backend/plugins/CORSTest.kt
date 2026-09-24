package com.tdt4290group7.backend.plugins

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CORSTest {
    @Test
    fun `parses full origins, keeping each entry's own scheme`() {
        assertEquals(
            listOf(AllowedOrigin("https", "app.example.no"), AllowedOrigin("http", "localhost:3000")),
            parseAllowedOrigins(" https://app.example.no , http://localhost:3000 ,"),
        )
    }

    @Test
    fun `rejects entries that are not bare http or https origins`() {
        listOf(
            "localhost:3000", // no scheme: would otherwise be guessed
            "app.example.no",
            "ftp://app.example.no",
            "https://app.example.no/path",
            "https://user@app.example.no",
            "https://",
            "",
        ).forEach { entry ->
            assertFailsWith<IllegalArgumentException>("should reject '$entry'") { parseAllowedOrigins(entry) }
        }
    }
}
