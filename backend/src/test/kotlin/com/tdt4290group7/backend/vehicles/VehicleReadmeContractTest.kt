package com.tdt4290group7.backend.vehicles

import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

class VehicleReadmeContractTest {
    @Test
    fun documentedSyntheticPostBodiesStillSatisfyTheCurrentContract() {
        val repository = VehicleRepository(Path.of("build", "test-data", "docs-${UUID.randomUUID()}.db"))
        val examples = Regex("~~~json\\s*([\\s\\S]*?)~~~").findAll(Files.readString(Path.of("README.md")))
        var validated = 0
        for (example in examples) {
            val text = example.groupValues[1]
            val root = Json.parseToJsonElement(text).jsonObject
            when {
                "rows" in root -> { repository.appendTripRows(decodeTripRowsRequest(text), Instant.now()); validated++ }
            }
        }
        assertEquals(1, validated)
    }
}
