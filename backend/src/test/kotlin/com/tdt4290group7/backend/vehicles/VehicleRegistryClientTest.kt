package com.tdt4290group7.backend.vehicles

import com.sun.net.httpserver.HttpServer
import java.math.BigDecimal
import java.net.InetSocketAddress
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertIs
import kotlin.test.assertTrue

class VehicleRegistryClientTest {
    /** Entirely synthetic; never load client data or make a live SVV call. */
    private val payload = """{"discardedRoot":"PRIVATE_SENTINEL","kjoretoydataListe":[{
        "kjoretoyId":{"kjennemerke":"AB12345","understellsnummer":"PRIVATE_SENTINEL"},
        "registrering":{"registreringsstatus":{"kodeVerdi":"REGISTRERT"}},
        "periodiskKjoretoyKontroll":{"sistGodkjent":"2025-01-10","kontrollfrist":"2027-01-01"},
        "godkjenning":{"tekniskGodkjenning":{
            "kjoretoyklassifisering":{"tekniskKode":{"kodeVerdi":"M1","kodeNavn":"Personbil"}},
            "tekniskeData":{
                "generelt":{"merke":[{"merke":"Test Make"}],"handelsbetegnelse":["Test Model"]},
                "vekter":{"tillattTotalvekt":1234},
                "karosseriOgLasteplan":{"karosseritype":{"kodeVerdi":"AC","kodeNavn":"Stasjonsvogn"}},
                "motorOgDrivverk":{"hybridKategori":{"kodeVerdi":"IKKE_HYBRID"},
                    "motor":[{"drivstoff":[{"drivstoffKode":{"kodeVerdi":"2","kodeNavn":"Diesel"}},
                        {"drivstoffKode":{"kodeVerdi":"5","kodeNavn":"Elektrisk"}}]}]},
                "miljodata":{"euroKlasse":{"kodeVerdi":"6","kodeNavn":"Euro 6"},
                    "miljoOgdrivstoffGruppe":[{"drivstoffKodeMiljodata":{"kodeVerdi":"2","kodeNavn":"Diesel"},
                        "forbrukOgUtslipp":[
                            {"malemetode":{"kodeVerdi":"WLTP"},"co2BlandetKjoring":123.456789,
                                "utslippNOxMgPrKm":12.34567,"forbrukBlandetKjoring":5.6,
                                "partikkelfilterFabrikkmontert":true,"utslippPartiklerMgPrKm":0.2},
                            {"malemetode":{"kodeVerdi":"NEDC"},"co2BlandetKjoring":100.12}]}]}
            }
        }}
    }]}"""

    @Test
    fun projectsOnlyAllowlistedFieldsAndKeepsFuelMethodAssociationsAndDecimals() {
        val data = projectRegistryVehicle(Json.parseToJsonElement(payload).jsonObject.getValue("kjoretoydataListe")
            .let { (it as kotlinx.serialization.json.JsonArray).single() }, "AB12345")
        assertEquals("Test Make", data.make)
        assertEquals(RegistryCode("M1", "Personbil"), data.vehicleCategory)
        assertEquals(RegistryCode("AC", "Stasjonsvogn"), data.bodyType)
        assertEquals(RegistryCode("5", "Elektrisk"), data.fuels.last().fuelTechnology)
        assertEquals("6", data.euroClass?.code)
        assertEquals("2025-01-10", data.lastApprovedInspectionDate)
        assertEquals("2027-01-01", data.nextInspectionDueDate)
        assertEquals(2, data.fuels.size)
        val measurements = data.fuels.first().measurements
        assertEquals(2, measurements.size)
        assertEquals("WLTP", measurements.first().measurementMethod?.code)
        assertEquals(BigDecimal("123.456789"), measurements.first().co2GramsPerKm)
        assertEquals(BigDecimal("12.34567"), measurements.first().noxMgPerKm)
        assertEquals("NEDC", measurements.last().measurementMethod?.code)
        val saved = Json.encodeToString(data)
        listOf("PRIVATE_SENTINEL", "kontrollfrist", "tillattTotalvekt", "forbrukBlandetKjoring",
            "partikkelfilter", "utslippPartikler", "understellsnummer", "hybridCategory").forEach { assertTrue(it !in saved) }
    }

    @Test
    fun rejectsWrongPlateAndInvalidSelectedMeasurementInsteadOfCachingIt() {
        val vehicle = (Json.parseToJsonElement(payload).jsonObject.getValue("kjoretoydataListe") as kotlinx.serialization.json.JsonArray).single()
        assertFails { projectRegistryVehicle(vehicle, "CD12345") }
        val invalid = payload.replace("123.456789", "-123.456789")
        val invalidVehicle = (Json.parseToJsonElement(invalid).jsonObject.getValue("kjoretoydataListe") as kotlinx.serialization.json.JsonArray).single()
        assertFails { projectRegistryVehicle(invalidVehicle, "AB12345") }
    }

    @Test
    fun inspectionDatesAreNullableAndMustBeRealDatesFromTheInspectionFields() {
        fun project(body: String) = projectRegistryVehicle(
            (Json.parseToJsonElement(body).jsonObject.getValue("kjoretoydataListe") as kotlinx.serialization.json.JsonArray).single(), "AB12345")
        val absent = project(payload.replace("\"sistGodkjent\":\"2025-01-10\",", "")
            .replace("\"kontrollfrist\":\"2027-01-01\"", "\"kontrollfrist\":null"))
        kotlin.test.assertNull(absent.lastApprovedInspectionDate)
        kotlin.test.assertNull(absent.nextInspectionDueDate)
        for (invalid in listOf("2025-02-30", "2025-1-10", "not-a-date")) {
            assertFails { project(payload.replace("2025-01-10", invalid)) }
        }
        val unrelated = payload.replace("\"periodiskKjoretoyKontroll\"", "\"unselectedInspectionData\"")
        kotlin.test.assertNull(project(unrelated).lastApprovedInspectionDate)
        kotlin.test.assertNull(project(unrelated).nextInspectionDueDate)
    }

    @Test
    fun actualHttpBoundaryFiltersResponseAndMapsErrorsWithoutLiveSvvCalls() = runBlocking {
        var status = 200
        var body = payload
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/vehicle") { exchange ->
            val bytes = body.toByteArray()
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
            exchange.close()
        }
        server.start()
        try {
            val client = VegvesenVehicleRegistryClient("synthetic-key",
                endpoint = "http://127.0.0.1:" + server.address.port + "/vehicle")
            assertIs<RegistryLookup.Found>(client.lookup("AB12345"))
            body = """{"kjoretoydataListe":[]}"""
            assertEquals(RegistryLookup.Failed(LookupOutcome.NOT_FOUND), client.lookup("AB12345"))
            body = "{}"
            assertEquals(RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE), client.lookup("AB12345"))
            body = payload.replace("AB12345", "CD12345")
            assertEquals(RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE), client.lookup("AB12345"))
            mapOf(401 to LookupOutcome.ACCESS_DENIED, 403 to LookupOutcome.ACCESS_DENIED,
                404 to LookupOutcome.NOT_FOUND, 422 to LookupOutcome.QUOTA_EXHAUSTED,
                429 to LookupOutcome.QUOTA_EXHAUSTED, 503 to LookupOutcome.TEMPORARILY_UNAVAILABLE).forEach { (code, outcome) ->
                status = code
                assertEquals(RegistryLookup.Failed(outcome), client.lookup("AB12345"))
            }
        } finally { server.stop(0) }
    }

    @Test
    fun selectedProjectionSurvivesStorageWithoutPersistingDiscardedPayload() = runBlocking {
        val path = java.nio.file.Path.of("build", "test-data", java.util.UUID.randomUUID().toString() + ".db")
        val repository = VehicleRepository(path)
        val vehicle = (Json.parseToJsonElement(payload).jsonObject.getValue("kjoretoydataListe") as kotlinx.serialization.json.JsonArray).single()
        val selected = projectRegistryVehicle(vehicle, "AB12345")
        val check = VehicleCheckService(repository, VehicleRegistryClient { RegistryLookup.Found(selected) })
            .check(VehicleCheckRequest("AB12345"))
        assertEquals(selected, repository.latestSnapshot("AB12345")?.data)
        assertEquals(check, repository.findCheck(check.id))
        val databaseBytes = String(java.nio.file.Files.readAllBytes(path), Charsets.ISO_8859_1)
        assertTrue("PRIVATE_SENTINEL" !in databaseBytes)
    }
}
