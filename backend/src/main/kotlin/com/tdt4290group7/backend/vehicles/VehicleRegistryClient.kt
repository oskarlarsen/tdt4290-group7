package com.tdt4290group7.backend.vehicles

import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

sealed interface RegistryLookup {
    data class Found(val data: RegistryVehicleData) : RegistryLookup
    data class Failed(val outcome: LookupOutcome) : RegistryLookup
}

fun interface VehicleRegistryClient {
    suspend fun lookup(normalizedRegistrationNumber: String): RegistryLookup
}

/** The public Enkeltoppslag API. It does not expose bruksforbud. */
class VegvesenVehicleRegistryClient(
    private val apiKey: String,
    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build(),
    private val endpoint: String = "https://akfell-datautlevering.atlas.vegvesen.no/enkeltoppslag/kjoretoydata",
) : VehicleRegistryClient {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun lookup(normalizedRegistrationNumber: String): RegistryLookup = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) return@withContext RegistryLookup.Failed(LookupOutcome.ACCESS_DENIED)
        val plate = URLEncoder.encode(normalizedRegistrationNumber, StandardCharsets.UTF_8)
        val request = HttpRequest.newBuilder(URI.create("$endpoint?kjennemerke=$plate"))
            .timeout(Duration.ofSeconds(20))
            .header("SVV-Authorization", "Apikey $apiKey")
            .header("Accept", "application/json")
            .GET()
            .build()
        try {
            val response = client.send(request, HttpResponse.BodyHandlers.ofString())
            when (response.statusCode()) {
                200 -> {
                    val payload = runCatching { json.parseToJsonElement(response.body()) }.getOrNull()
                    val vehicles = (payload as? JsonObject)?.get("kjoretoydataListe") as? JsonArray
                    when {
                        vehicles == null -> RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE)
                        vehicles.isEmpty() -> RegistryLookup.Failed(LookupOutcome.NOT_FOUND)
                        vehicles.size != 1 -> RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE)
                        else -> runCatching {
                            RegistryLookup.Found(projectRegistryVehicle(vehicles.single(), normalizedRegistrationNumber))
                        }.getOrElse { RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE) }
                    }
                }
                401, 403 -> RegistryLookup.Failed(LookupOutcome.ACCESS_DENIED)
                404 -> RegistryLookup.Failed(LookupOutcome.NOT_FOUND)
                422, 429 -> RegistryLookup.Failed(LookupOutcome.QUOTA_EXHAUSTED)
                500, 502, 503, 504 -> RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
                else -> RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE)
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
        } catch (_: java.io.IOException) {
            RegistryLookup.Failed(LookupOutcome.TEMPORARILY_UNAVAILABLE)
        }
    }
}

/** Project immediately at the boundary. Unselected fields never reach storage or responses. */
internal fun projectRegistryVehicle(element: JsonElement, requestedPlate: String): RegistryVehicleData {
    val vehicle = element as? JsonObject ?: error("Invalid vehicle object")
    val plate = vehicle.at("kjoretoyId", "kjennemerke").stringOrNull()
        ?: error("Missing registration number")
    require(normalizeRegistrationNumber(plate) == requestedPlate) { "Unexpected vehicle" }
    val approval = vehicle.at("godkjenning", "tekniskGodkjenning")
    val technical = approval.at("tekniskeData")
    val general = technical.at("generelt")
    val environment = technical.at("miljodata")
    val drivetrain = technical.at("motorOgDrivverk")
    val environmentalFuels = environment.at("miljoOgdrivstoffGruppe").arrayOrEmpty().map { group ->
        RegistryFuel(
            fuelTechnology = group.at("drivstoffKodeMiljodata").registryCode(),
            measurements = group.at("forbrukOgUtslipp").arrayOrEmpty().map { measurement ->
                RegistryEmissionMeasurement(
                    measurementMethod = measurement.at("malemetode").registryCode(),
                    co2GramsPerKm = measurement.at("co2BlandetKjoring").decimalOrNull(),
                    noxMgPerKm = measurement.at("utslippNOxMgPrKm").decimalOrNull(),
                )
            },
        )
    }
    val engineFuels = drivetrain.at("motor").arrayOrEmpty().flatMap { motor ->
        motor.at("drivstoff").arrayOrEmpty().mapNotNull { it.at("drivstoffKode").registryCode() }
    }.distinctBy { it.code }
    val fuels = environmentalFuels + engineFuels
        .filter { engine -> environmentalFuels.none { it.fuelTechnology?.code == engine.code } }
        .map { RegistryFuel(it) }
    return RegistryVehicleData(
        registrationNumber = requestedPlate,
        registrationStatus = vehicle.at("registrering", "registreringsstatus").registryCode()?.code,
        make = general.at("merke").arrayOrEmpty().mapNotNull { it.at("merke").stringOrNull() }
            .distinct().joinToString("; ").ifEmpty { null },
        model = general.at("handelsbetegnelse").arrayOrEmpty().mapNotNull { it.stringOrNull() }
            .distinct().joinToString("; ").ifEmpty { null },
        vehicleCategory = approval.at("kjoretoyklassifisering", "tekniskKode").registryCode(),
        hybridCategory = drivetrain.at("hybridKategori").registryCode(),
        euroClass = environment.at("euroKlasse").registryCode(),
        fuels = fuels,
    )
}

private fun JsonElement?.at(vararg path: String): JsonElement? =
    path.fold(this) { current, key -> (current as? JsonObject)?.get(key) }

private fun JsonElement?.stringOrNull(): String? = when (this) {
    null, JsonNull -> null
    is JsonPrimitive -> {
        require(isString) { "Expected text" }
        content
    }
    else -> error("Expected text")
}

private fun JsonElement?.arrayOrEmpty(): JsonArray = when (this) {
    null, JsonNull -> JsonArray(emptyList())
    is JsonArray -> this
    else -> error("Expected array")
}

private fun JsonElement?.registryCode(): RegistryCode? = when (this) {
    null, JsonNull -> null
    is JsonPrimitive -> RegistryCode(requireNotNull(stringOrNull()))
    is JsonObject -> at("kodeVerdi").stringOrNull()?.let { RegistryCode(it, at("kodeNavn").stringOrNull()) }
    else -> error("Expected code")
}

private fun JsonElement?.decimalOrNull(): java.math.BigDecimal? = when (this) {
    null, JsonNull -> null
    else -> Json.decodeFromJsonElement(DecimalSerializer, this)
}
