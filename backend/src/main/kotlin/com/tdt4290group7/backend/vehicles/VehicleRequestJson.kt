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

/** Keep fleet requests as strict about JSON token types as reporting requests. */
internal fun <T> decodeFleetRequest(text: String, serializer: kotlinx.serialization.DeserializationStrategy<T>): T {
    fun validate(root: JsonObject) {
        root.textFields("name", "orgNumber", "supplierId", "startDate", "endDate", "note", "expectedUpdatedAt", "registrationNumber")
        root.booleanFields("planned")
        root["allowedVehicles"]?.let {
            val number = it as? JsonPrimitive ?: invalidType()
            if (number.isString || !number.content.matches(Regex("-?(0|[1-9][0-9]*)"))) invalidType()
        }
        for (key in listOf("supplier", "agreement", "replacement")) root[key]?.let { validate(it as? JsonObject ?: invalidType()) }
    }
    val root = requestObject(text)
    validate(root)
    return requestJson.decodeFromJsonElement(serializer, root)
}

/** Kotlinx's primitive decoders can coerce quoted numbers/bools and unquoted text.
 * Check JSON token types as well as the DTO's allowed keys and value constraints. */
fun decodeTripRowsRequest(text: String): AppendTripRowsRequest {
    val root = requestObject(text)
    root.textFields("sourceName")
    root.items("rows").forEach { row ->
        row.textFields("registrationNumber", "periodStart", "periodEnd", "fuelTechnology",
            "make", "bodyType", "vehicleCategory", "model", "comment")
        row.booleanFields("co2Registered")
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
