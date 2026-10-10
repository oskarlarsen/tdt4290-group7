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

sealed interface RegistryLookup {
    data class Found(val data: RegistryValue) : RegistryLookup
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
                    val data = runCatching { json.parseToJsonElement(response.body()).toRegistryValue() }.getOrNull()
                    val vehicles = data?.field("kjoretoydataListe") as? RegistryValue.ArrayValue
                    when {
                        vehicles == null -> RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE)
                        vehicles.items.isEmpty() -> RegistryLookup.Failed(LookupOutcome.NOT_FOUND)
                        vehicles.items.size != 1 -> RegistryLookup.Failed(LookupOutcome.INVALID_RESPONSE)
                        else -> RegistryLookup.Found(data)
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

fun RegistryValue.registrationStatus(): String? {
    val vehicles = field("kjoretoydataListe") as? RegistryValue.ArrayValue ?: return null
    val vehicle = vehicles.items.singleOrNull() ?: return null
    return vehicle.field("registrering")
        ?.field("registreringsstatus")
        ?.field("kodeVerdi")
        ?.text()
}
