package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlin.test.*

class VehicleRequestJsonTest {
    private val baseline = Json.parseToJsonElement(Json.encodeToString(syntheticTrip())).jsonObject
    private fun body(extra: String = "", omit: String? = null): String {
        val overrides = Json.parseToJsonElement("{" + extra.removePrefix(",") + "}").jsonObject
        val row = JsonObject((baseline + overrides).filterKeys { it != omit })
        return "{\"rows\":[$row]}"
    }

    @Test
    fun acceptsExactJsonNumbersIncludingExponentButNotNumericStrings() {
        val input = decodeTripRowsRequest(body(""","co2GramsPerKm":123.456789,"totalTripKm":1e3,
            "medianCo2":12.34,"totalKmNoxRegistered":1000,"totalNoxRegisteredGrams":12.345,
            "tripCount":3,"co2Registered":true""")).rows.single()
        assertEquals(BigDecimal("123.456789"), input.co2GramsPerKm)
        assertEquals(0, input.totalTripKm.compareTo(BigDecimal("1000")))
        assertEquals(3, input.tripCount)
        val output = Json.encodeToString(StoredTripRow("row", "AB12345", createdAt = "2026-01-01T00:00:00Z", data = input))
        assertTrue("123.456789" in output && "\"estimatedCo2Kg\":123.456789" in output)
    }

    @Test
    fun rejectsLegacyReadOnlyUnknownAndWronglyTypedFields() {
        listOf(
            "\"fuel\":\"Diesel\"", "\"vehicleType\":\"Sedan\"", "\"hybridCategory\":\"INGEN\"",
            "\"estimatedCo2Kg\":123", "\"additionalFields\":{}", "\"co2GramsPerKm\":\"123.45\"",
            "\"assignmentNumber\":\"job\"", "\"averageConsumptionLitresPerKm\":0.08",
            "\"co2Registered\":\"true\"", "\"tripCount\":\"3\"", "\"tripCount\":3.0",
            "\"make\":123", "\"periodStart\":123", "\"co2GramsPerKm\":-1",
            "\"co2GramsPerKm\":1e1000000", "\"co2GramsPerKm\":0.0000000000000000001",
            "\"fuelTechnology\":2", "\"fuelTechnology\":\"Diesel\"", "\"fuelTechnology\":\"999\"",
            "\"vehicleCategory\":\"light\"", "\"vehicleCategory\":\"L3e\"", "\"bodyType\":\"Station wagon\"",
        ).forEach { extra -> assertFailsWith<SerializationException>(extra) { decodeTripRowsRequest(body(extra)) } }
        for (extra in listOf("\"vehicleGroup\":\"light\"", "\"fuelTechnology\":2", "\"fuelTechnology\":null", "\"usedThroughoutPeriod\":true")) {
            assertFailsWith<SerializationException> {
                decodeApprovalsRequest("{\"approvals\":[{\"registrationNumber\":\"AB12345\",\"fuelTechnology\":\"2\",\"vehicleCategory\":\"M1\",$extra}]}")
            }
        }
        assertFailsWith<SerializationException> { decodeVehicleCheckRequest("""{"registrationNumber":"AB12345","forceRefresh":"true"}""") }
    }

    @Test
    fun everyStatisticsFieldExceptReferencesCommentsAndConditionalLitresIsRequired() {
        val optional = setOf("comment", "averageFuelConsumptionLitresPer100Km", "fuelConsumedLitres")
        val nullable = setOf("co2GramsPerKm", "medianCo2", "totalNoxRegisteredGrams", "totalKmCo2Registered", "totalKmNoxRegistered")
        baseline.keys.filterNot { it in optional }.forEach { key ->
            assertFailsWith<SerializationException>(key) { decodeTripRowsRequest(body(omit = key)) }
            if (key !in nullable) assertFailsWith<SerializationException>(key) { decodeTripRowsRequest(body("\"$key\":null")) }
        }
        assertEquals(false, decodeTripRowsRequest(body("\"co2Registered\":false")).rows.single().co2Registered)
        assertEquals(BigDecimal.ZERO, decodeTripRowsRequest(body()).rows.single().totalNoxRegisteredGrams)
        for (code in listOf("5", "6", "NOT_APPLICABLE")) {
            val input = decodeTripRowsRequest(body("\"fuelTechnology\":\"$code\",\"averageFuelConsumptionLitresPer100Km\":null,\"fuelConsumedLitres\":null"))
            assertNull(input.rows.single().fuelConsumedLitres)
        }
        for (key in listOf("fuelTechnology", "vehicleCategory")) {
            val approval = Json.parseToJsonElement(Json.encodeToString(syntheticApproval())).jsonObject
            assertFailsWith<SerializationException> {
                decodeApprovalsRequest("{\"approvals\":[${JsonObject(approval.filterKeys { it != key })}]}")
            }
        }
    }

    @Test
    fun explicitNullEmissionKeysAndPerHundredKilometreUnitSurviveJson() {
        val electric = decodeTripRowsRequest(body(""""fuelTechnology":"5","co2Registered":false,
            "co2GramsPerKm":null,"medianCo2":null,"totalNoxRegisteredGrams":null,
            "totalKmCo2Registered":null,"totalKmNoxRegistered":null,
            "averageFuelConsumptionLitresPer100Km":null,"fuelConsumedLitres":null""")).rows.single()
        assertNull(electric.estimateCo2Kg())
        assertTrue("\"estimatedCo2Kg\":null" in Json.encodeToString(StoredTripRow("row", "AB12345", createdAt = "synthetic", data = electric)))
        assertEquals(BigDecimal("8.25"), decodeTripRowsRequest(body("\"averageFuelConsumptionLitresPer100Km\":8.25")).rows.single().averageFuelConsumptionLitresPer100Km)
    }
}
