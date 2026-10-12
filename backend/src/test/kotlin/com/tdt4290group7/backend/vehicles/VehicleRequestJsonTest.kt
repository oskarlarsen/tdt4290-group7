package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class VehicleRequestJsonTest {
    private fun body(extra: String = "") = """{"rows":[{"registrationNumber":"AB12345",
        "periodStart":"2026-01-01","periodEnd":"2026-01-31"$extra}]}"""

    @Test
    fun acceptsExactJsonNumbersIncludingExponentButNotNumericStrings() {
        val input = decodeTripRowsRequest(body(""","co2GramsPerKm":123.456789,"totalTripKm":1e3,
            "medianCo2":12.34,"totalKmNoxRegistered":1000,"totalNoxRegisteredGrams":12.345,
            "tripCount":3,"co2Registered":true""")).rows.single()
        assertEquals(BigDecimal("123.456789"), input.co2GramsPerKm)
        assertEquals(0, input.totalTripKm!!.compareTo(BigDecimal("1000")))
        assertEquals(3, input.tripCount)
        assertEquals(true, input.co2Registered)
        val output = Json.encodeToString(StoredTripRow("row", "AB12345", createdAt = "2026-01-01T00:00:00Z", data = input))
        assertTrue("123.456789" in output && """"estimatedCo2Kg":123.456789""" in output)
    }

    @Test
    fun rejectsUnknownLegacyReadOnlyAndWronglyTypedFields() {
        listOf(
            ""","fuel":"Diesel"""", ""","kmPerBus":100""", ""","additionalFields":{}""",
            ""","estimatedCo2Kg":123""", ""","co2GramsPerKm":"123.45"""",
            ""","co2Registered":"true"""", ""","tripCount":"3"""", ""","tripCount":3.0""",
            ""","make":123""", ""","periodStart":123""", ""","co2GramsPerKm":-1""",
            ""","co2GramsPerKm":1e1000000""", ""","co2GramsPerKm":0.0000000000000000001""",
        ).forEach { extra -> assertFailsWith<SerializationException> { decodeTripRowsRequest(body(extra)) } }
        assertFailsWith<SerializationException> {
            decodeTripRowsRequest("""{"rows":[{"registrationNumber":"AB12345"}]}""")
        }
        assertFailsWith<SerializationException> {
            decodeApprovalsRequest("""{"approvals":[{"registrationNumber":"AB12345","additionalFields":{}}]}""")
        }
        assertFailsWith<SerializationException> {
            decodeApprovalsRequest("""{"approvals":[{"registrationNumber":"AB12345","usedThroughoutPeriod":"true"}]}""")
        }
        assertFailsWith<SerializationException> {
            decodeVehicleCheckRequest("""{"registrationNumber":"AB12345","forceRefresh":"true"}""")
        }
        assertFailsWith<SerializationException> {
            decodeVehicleCheckRequest("""{"registrationNumber":12345}""")
        }
    }

    @Test
    fun acceptsMissingOptionalValuesAndKeepsFalseDistinctFromUnknown() {
        assertEquals(null, decodeTripRowsRequest(body()).rows.single().co2Registered)
        assertEquals(false, decodeTripRowsRequest(body(""","co2Registered":false""")).rows.single().co2Registered)
        assertEquals(null, decodeTripRowsRequest(body(""","co2GramsPerKm":null""")).rows.single().co2GramsPerKm)
    }
}
