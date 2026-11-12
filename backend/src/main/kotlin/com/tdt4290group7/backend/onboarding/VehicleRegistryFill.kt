package com.tdt4290group7.backend.onboarding

import com.tdt4290group7.backend.vehicles.FuelTechnology
import com.tdt4290group7.backend.vehicles.LookupOutcome
import com.tdt4290group7.backend.vehicles.RegistryVehicleData
import com.tdt4290group7.backend.vehicles.VehicleCategory
import com.tdt4290group7.backend.vehicles.VehicleRegistryLookup
import java.time.Instant
import java.util.Locale

/** Fuel and hybrid status worked out from what Statens vegvesen lists for a vehicle. */
data class FilledFuel(val fuelTechnologyCode: String, val isHybrid: Boolean, val vehicleCategory: String? = null)

/**
 * Fills in fuel and hybrid status for vehicle rows the supplier left blank, using Statens vegvesen.
 * It runs at upload preview, so the supplier sees the result in the preview table and nothing new is stored
 * until they confirm. A row that cannot be filled becomes a plain-language error, never a guess.
 */
object VehicleRegistryFill {
    /** Each lookup is a live request against a quota, so a single preview only checks this many vehicles. */
    const val MAX_LOOKUPS_PER_PREVIEW = 50

    private val HYBRID_CODES = setOf("7", "8") // gasoline hybrid, diesel hybrid
    private const val ELECTRIC_CODE = "5"

    /** Null when the registry lists no fuel, or only fuels this app has no code for. */
    fun fuelFrom(data: RegistryVehicleData): FilledFuel? =
        fuelFromCodes(data.fuels.mapNotNull { it.fuelTechnology?.code }, data.vehicleCategory?.code)

    fun fuelFromCodes(allCodes: List<String>, categoryCode: String?): FilledFuel? {
        val codes = allCodes
            .filter { code -> FuelTechnology.entries.any { it.code == code } }
            .distinct()
        if (codes.isEmpty()) return null
        // A plug-in hybrid is listed with both a combustion fuel and electricity.
        val hybrid = codes.any { it in HYBRID_CODES } || (codes.size > 1 && ELECTRIC_CODE in codes)
        val chosen = codes.firstOrNull { it in HYBRID_CODES } ?: if (codes.size > 1) codes.first { it != ELECTRIC_CODE } else codes.single()
        val category = categoryCode?.takeIf { code -> VehicleCategory.entries.any { it.name == code } }
        return FilledFuel(chosen, hybrid, category)
    }

    /** A hybrid flag from the supplier's own fuel choice, for rows where only the fuel was given. */
    fun hybridFor(fuelTechnologyCode: String): Boolean = fuelTechnologyCode in HYBRID_CODES

    data class Result(val rows: List<Map<String, String>>, val errors: List<CsvCellError>, val warnings: List<String> = emptyList())

    /** Rows without a fuel and no registry to ask: a plain error telling the supplier what to do. */
    fun withoutRegistry(rows: List<Map<String, String>>): Result = fill(rows, null)

    private fun fill(rows: List<Map<String, String>>, lookups: Map<String, LookupResult>?): Result {
        val errors = mutableListOf<CsvCellError>()
        val warnings = mutableListOf<String>()
        val filled = rows.mapIndexed { index, row ->
            val csvRow = index + 2
            val fuel = row["fuel_technology"]?.trim().orEmpty()
            val plate = row["registration_number"]?.trim()?.uppercase(Locale.ROOT).orEmpty()
            when {
                // The supplier gave the fuel, so a registry outage is fine, but an unknown plate means the report is wrong.
                fuel.isNotEmpty() && lookups?.get(plate) is LookupResult.NotFound -> {
                    errors += CsvCellError(csvRow, "registration_number", "$plate was not found in Statens vegvesen. Check the registration number.", plate)
                    row + ("registry_status" to "NOT_FOUND")
                }
                fuel.isNotEmpty() -> row + mapOf(
                    "is_hybrid" to (row["is_hybrid"]?.trim()?.takeIf { it.isNotEmpty() } ?: hybridFor(fuel).toString().uppercase(Locale.ROOT)),
                    // Not asked yet (over the preview limit, or the service was down): checked after the import is confirmed.
                    "registry_status" to if (plate.isNotEmpty() && (lookups == null || lookups[plate] is LookupResult.NotChecked || lookups[plate] is LookupResult.NoRegistry)) "NOT_CHECKED" else "PROVIDED",
                )
                plate.isEmpty() -> row + ("registry_status" to "NOT_CHECKED") // planned: the parser already asked for a fuel
                else -> when (val result = lookups?.get(plate)) {
                    is LookupResult.Filled -> row + mapOf(
                        "fuel_technology" to result.fuel.fuelTechnologyCode,
                        "is_hybrid" to result.fuel.isHybrid.toString().uppercase(Locale.ROOT),
                        "registry_status" to "FILLED",
                    ) + (result.fuel.vehicleCategory?.let { mapOf("vehicle_category" to it) } ?: emptyMap())
                    is LookupResult.NotFound -> {
                        errors += CsvCellError(csvRow, "registration_number", "$plate was not found in Statens vegvesen. Check the registration number.", plate)
                        row + ("registry_status" to "NOT_FOUND")
                    }
                    is LookupResult.NotChecked, is LookupResult.NoRegistry, null -> {
                        if (lookups == null || lookups[plate] is LookupResult.NoRegistry) {
                            errors += CsvCellError(csvRow, "fuel_technology", "Statens vegvesen could not be checked. Fill in fuel_technology yourself.", plate)
                            row + ("registry_status" to "NOT_CHECKED")
                        } else {
                            // The registry could not be asked (e.g. it is down): import anyway and fill the fuel in when it is checked afterwards.
                            if (warnings.isEmpty()) warnings += "We could not fetch the fuel type for some vehicles automatically. Fill it in yourself, or import them without it and we will check them afterwards."
                            row + mapOf("fuel_technology" to "", "is_hybrid" to "FALSE", "registry_status" to "NOT_CHECKED")
                        }
                    }
                }
            }
        }
        return Result(filled, errors, warnings)
    }

    sealed interface LookupResult {
        data class Filled(val fuel: FilledFuel) : LookupResult
        data object NotFound : LookupResult
        data object NotChecked : LookupResult
        /** No registry is configured at all, so nothing can be checked afterwards either. */
        data object NoRegistry : LookupResult
    }

    /** [approved] holds plates on the supplier's approved list: they are matched against the list first and only the rest reach Statens vegvesen. */
    suspend fun fillFromRegistry(rows: List<Map<String, String>>, registry: VehicleRegistryLookup?, now: Instant, approved: Map<String, FilledFuel?> = emptyMap()): Result {
        // Every plate that is not on the approved list is checked, also when the fuel is given, so a wrong plate is caught.
        val needed = rows.filter { !it["registration_number"].isNullOrBlank() && (it["fuel_technology"].isNullOrBlank() || it["registration_number"]!!.trim().uppercase(Locale.ROOT) !in approved) }
            .map { it["registration_number"]!!.trim().uppercase(Locale.ROOT) }.distinct()
        val results = mutableMapOf<String, LookupResult>()
        for ((position, plate) in needed.withIndex()) {
            results[plate] = when {
                plate in approved -> approved[plate]?.let { LookupResult.Filled(it) } ?: LookupResult.NotChecked
                registry == null -> LookupResult.NoRegistry
                position >= MAX_LOOKUPS_PER_PREVIEW -> LookupResult.NotChecked
                else -> lookup(registry, plate, now)
            }
        }
        return fill(rows, results)
    }

    private suspend fun lookup(registry: VehicleRegistryLookup, plate: String, now: Instant): LookupResult {
        val (check, _) = try {
            registry.resolve(plate, cached = null, forceRefresh = true, now = now)
        } catch (_: Exception) {
            return LookupResult.NotChecked
        }
        if (check.lookupOutcome == LookupOutcome.NOT_FOUND) return LookupResult.NotFound
        val fuel = check.data?.let(::fuelFrom) ?: return LookupResult.NotChecked
        return LookupResult.Filled(fuel)
    }
}
