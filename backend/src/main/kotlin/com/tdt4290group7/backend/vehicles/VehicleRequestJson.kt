package com.tdt4290group7.backend.vehicles

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement

private val requestJson = Json { ignoreUnknownKeys = false; isLenient = false }

/** Kotlinx's primitive decoders can coerce quoted numbers/bools and unquoted text.
 * Check JSON token types as well as the DTO's allowed keys and value constraints. */
fun decodeTripRowsRequest(text: String): AppendTripRowsRequest {
    val root = requestObject(text)
    root.textFields("sourceName")
    root.items("rows").forEach { row ->
        row.textFields("registrationNumber", "periodStart", "periodEnd", "fuelTechnology",
            "make", "bodyType", "vehicleCategory", "model", "assignmentNumber", "comment")
        row.booleanFields("co2Registered")
        row["tripCount"]?.takeUnless { it == JsonNull }?.let {
            val value = it as? JsonPrimitive ?: invalidType()
            if (value.isString || !value.content.matches(Regex("-?(0|[1-9][0-9]*)"))) invalidType()
        }
    }
    return requestJson.decodeFromJsonElement(root)
}

fun decodeApprovalsRequest(text: String): UpsertApprovalsRequest {
    val root = requestObject(text)
    root.textFields("sourceName")
    root.items("approvals").forEach {
        it.textFields("registrationNumber", "fuelTechnology", "startDate", "expiryDate", "vehicleCategory")
        it.booleanFields("usedThroughoutPeriod")
    }
    return requestJson.decodeFromJsonElement(root)
}

fun decodeVehicleCheckRequest(text: String): VehicleCheckRequest {
    val root = requestObject(text)
    root.textFields("registrationNumber")
    root.booleanFields("forceRefresh")
    return requestJson.decodeFromJsonElement(root)
}

private fun requestObject(text: String): JsonObject =
    requestJson.parseToJsonElement(text) as? JsonObject ?: invalidType()

private fun JsonObject.items(key: String): List<JsonObject> =
    ((get(key) as? JsonArray) ?: invalidType()).map { it as? JsonObject ?: invalidType() }

private fun JsonObject.textFields(vararg names: String) {
    names.forEach { name -> this[name]?.takeUnless { it == JsonNull }?.let {
        if (it !is JsonPrimitive || !it.isString) invalidType()
    } }
}

private fun JsonObject.booleanFields(vararg names: String) {
    names.forEach { name -> this[name]?.takeUnless { it == JsonNull }?.let {
        if (it !is JsonPrimitive || it.isString || it.content !in listOf("true", "false")) invalidType()
    } }
}

private fun invalidType(): Nothing = throw SerializationException("Unexpected JSON field type")
