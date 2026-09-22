package com.tdt4290group7.backend.vehicles

import java.nio.file.Path
import java.util.Collections
import java.util.UUID
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull

class VehicleCheckServiceTest {
    @Test
    fun storesEveryRegistryFieldAndFlagsOnlyKnownStatuses() = runBlocking {
        val path = Path.of("build", "test-data", "${UUID.randomUUID()}.db")
        val repository = VehicleRepository(path)
        val vehicleImport = repository.insertImport(
            VehicleImportRequest(
                sourceName = "trip-statistics",
                rows = listOf(
                    VehicleRowInput("AB 12345", tripCount = "3"),
                    VehicleRowInput("AB12345", tripCount = "7"),
                    VehicleRowInput("CD54321"),
                ),
            ),
        )
        val lookups = Collections.synchronizedMap(mutableMapOf<String, Int>())
        val registry = VehicleRegistryClient { plate ->
            lookups[plate] = (lookups[plate] ?: 0) + 1
            if (plate == "CD54321") {
                RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
            } else {
                RegistryLookup.Found(
                    Json.parseToJsonElement(
                        """{"kjoretoydataListe":[{"registrering":{"registreringsstatus":{"kodeVerdi":"AVREGISTRERT"}},
                            "godkjenning":{"tekniskGodkjenning":{"tekniskeData":{"miljodata":
                            {"co2":123.50,"other":null,"flags":[true,"x"]}}}}}]}""",
                    ).toRegistryValue(),
                )
            }
        }

        val run = assertNotNull(VehicleCheckService(repository, registry).checkImport(vehicleImport.id))
        assertEquals(2, run.checkedCount)
        assertEquals(1, run.deviationCount)
        assertEquals(1, run.unavailableCount)
        assertEquals(mapOf("AB12345" to 1, "CD54321" to 1), lookups)
        assertEquals(listOf(VehicleDeviation.DEREGISTERED), run.results[0].deviations)
        assertEquals(emptyList(), run.results[1].deviations)

        val reopened = VehicleRepository(path)
        assertEquals(3, reopened.rowsForImport(vehicleImport.id).size)
        assertEquals(run, reopened.latestCheckRun(vehicleImport.id))
        val snapshot = assertNotNull(reopened.findSnapshot(assertNotNull(run.results[0].registrySnapshotId)))
        val vehicle = assertIs<RegistryValue.ArrayValue>(snapshot.data.field("kjoretoydataListe")).items.single()
        val environment = vehicle.field("godkjenning")
            ?.field("tekniskGodkjenning")
            ?.field("tekniskeData")
            ?.field("miljodata")
        assertEquals(RegistryValue.NumberValue("123.50"), environment?.field("co2"))
        assertEquals(RegistryValue.NullValue, environment?.field("other"))
        assertEquals(
            RegistryValue.ArrayValue(listOf(RegistryValue.BooleanValue(true), RegistryValue.StringValue("x"))),
            environment?.field("flags"),
        )
    }

    @Test
    fun unknownStatusIsNeverTreatedAsCompliant() = runBlocking {
        val repository = VehicleRepository(Path.of("build", "test-data", "${UUID.randomUUID()}.db"))
        val vehicleImport = repository.insertImport(
            VehicleImportRequest("test", listOf(VehicleRowInput("AB12345"))),
        )
        val registry = VehicleRegistryClient {
            RegistryLookup.Found(
                Json.parseToJsonElement("""{"kjoretoydataListe":[{"registrering":{}}]}""").toRegistryValue(),
            )
        }
        val run = assertNotNull(VehicleCheckService(repository, registry).checkImport(vehicleImport.id))
        assertEquals(listOf(VehicleDeviation.UNKNOWN_REGISTRATION_STATUS), run.results.single().deviations)
    }
}
