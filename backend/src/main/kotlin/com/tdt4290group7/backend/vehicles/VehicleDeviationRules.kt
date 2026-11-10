package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer
import java.time.LocalDate
import java.util.Locale

/** Round only comparisons. Stored supplier/registry numbers retain their exact precision. */
internal fun rounded(value: BigDecimal) = value.setScale(0, RoundingMode.HALF_UP)
private fun ratio(numerator: BigDecimal, distance: BigDecimal) = numerator.divide(distance, 0, RoundingMode.HALF_UP)
private fun normalizedText(value: String) = Normalizer.normalize(value, Normalizer.Form.NFKD)
    .lowercase(Locale.ROOT).filter { it.isLetterOrDigit() }
private fun sameText(reported: String, registry: String) = registry.split(';').any { normalizedText(it) == normalizedText(reported) }
private fun knownFuel(code: String?) = code?.toIntOrNull()?.let { it in 1..22 } == true

internal fun evaluateDeviationRules(agreement: AgreementEvidence?, vehicle: Vehicle, rows: List<StoredTripRow>,
    registry: RegistryCheckResult, today: LocalDate): List<DeviationFinding> = buildList {
    fun finding(code: VehicleDeviation, description: String, origin: DeviationOrigin = DeviationOrigin.STATISTICS,
        priority: DeviationPriority = DeviationPriority.MODERATE, row: StoredTripRow? = null,
        relatedRow: StoredTripRow? = null,
        fuelIndex: Int? = null, measurementIndex: Int? = null) {
        add(DeviationFinding(code, priority, origin, description, row?.id, relatedRow?.id, fuelIndex, measurementIndex))
    }
    val dates = agreement?.agreement
    when {
        dates == null || !dates.active || !vehicle.listed -> finding(VehicleDeviation.NOT_ON_AGREEMENT_LIST,
            "${vehicle.registrationNumber} is not in the agreement's current vehicle list.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH)
        today.toString() < dates.startDate -> finding(VehicleDeviation.AGREEMENT_NOT_STARTED,
            "The supplier's agreement starts on ${dates.startDate}.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH)
        today.toString() > dates.endDate -> finding(VehicleDeviation.AGREEMENT_EXPIRED,
            "The supplier's agreement ended on ${dates.endDate}.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH)
    }
    val orderedRows = rows.sortedBy { it.data.periodStart }
    var furthest: StoredTripRow? = null
    for (b in orderedRows) {
        val a = furthest
        if (a != null && b.data.periodStart <= a.data.periodEnd) finding(VehicleDeviation.OVERLAPPING_STATISTICS,
            "Review: reporting periods ${a.data.periodStart}–${a.data.periodEnd} and ${b.data.periodStart}–${b.data.periodEnd} overlap. Rows are retained separately, not summed.",
            row = b, relatedRow = a)
        if (a == null || b.data.periodEnd > a.data.periodEnd) furthest = b
    }
    if (registry.dataSource in setOf(RegistryDataSource.UNAVAILABLE, RegistryDataSource.STALE_CACHE))
        finding(VehicleDeviation.UNABLE_TO_VERIFY,
            "Unable to verify current registry facts (${(registry.refreshFailure ?: registry.lookupOutcome).toString().lowercase().replace('_', ' ')}). ${if (registry.data != null) "Comparisons use older information fetched at ${registry.fetchedAt}." else "No registry information is available."}",
            DeviationOrigin.REGISTRY)
    val data = registry.data
    if (data != null) {
        for ((fi, fuel) in data.fuels.withIndex()) {
            val co2 = fuel.measurements.mapNotNull { m -> m.co2GramsPerKm?.let { "${m.measurementMethod?.code ?: "unknown method"}: ${it.toPlainString()} g/km (rounded ${rounded(it)})" } }
            if (fuel.measurements.mapNotNull { it.co2GramsPerKm?.let(::rounded) }.distinct().size > 1)
                finding(VehicleDeviation.REGISTRY_CO2_DISAGREEMENT,
                    "Review: Statens vegvesen CO₂ measurements differ for fuel ${fuel.fuelTechnology?.code ?: "unknown"}: ${co2.joinToString("; ")}. Different methods may explain the discrepancy.",
                    DeviationOrigin.REGISTRY, fuelIndex = fi)
        }
    }
    for (row in rows) {
        val input = row.data
        if (dates != null && (input.periodStart < dates.startDate || input.periodEnd > dates.endDate))
            finding(VehicleDeviation.AGREEMENT_PERIOD_NOT_COVERED, "The reporting period ${input.periodStart} to ${input.periodEnd} extends outside the agreement's dates.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH, row)
        if (input.fuelTechnology.usesLitres) {
            if (input.totalTripKm.signum() > 0) {
                val computed = ratio(input.fuelConsumedLitres!!.multiply(BigDecimal("100")), input.totalTripKm)
                val reported = rounded(input.averageFuelConsumptionLitresPer100Km!!)
                if (computed != reported) finding(VehicleDeviation.CONSUMPTION_MISMATCH,
                    "Review: reported average ${input.averageFuelConsumptionLitresPer100Km.toPlainString()} L/100km rounds to $reported; total liters × 100 ÷ total distance rounds to $computed L/100km. The calculation assumes the same reporting scope.", row = row)
            } else if (input.fuelConsumedLitres!!.signum() > 0 || input.averageFuelConsumptionLitresPer100Km!!.signum() > 0)
                finding(VehicleDeviation.UNABLE_TO_VERIFY, "Unable to calculate fuel consumption: total distance is zero but fuel/average consumption is positive.", row = row)
        }
        if (data == null) continue
        fun missing(label: String) = finding(VehicleDeviation.UNABLE_TO_VERIFY, "Unable to verify $label for this row: the relevant registry value is missing.", DeviationOrigin.REGISTRY, row = row)
        data.vehicleCategory?.code?.let { code -> if (categoryGroup(code) != input.vehicleCategory.name)
            finding(VehicleDeviation.CATEGORY_MISMATCH, "Reported category ${input.vehicleCategory} differs from registry category $code (group ${categoryGroup(code)}).", DeviationOrigin.REGISTRY, DeviationPriority.HIGH, row) } ?: missing("vehicle category")
        data.bodyType?.code?.let { code -> if (code != input.bodyType.name)
            finding(VehicleDeviation.BODY_TYPE_MISMATCH, "Review: reported body type ${input.bodyType} differs from registry body type $code.", DeviationOrigin.REGISTRY, row = row) } ?: missing("body type")
        data.make?.let { if (!sameText(input.make, it)) finding(VehicleDeviation.BRAND_MISMATCH, "Review: vehicle brand '${input.make}' differs from registry '$it'. Naming differences may explain this.", DeviationOrigin.REGISTRY, row = row) } ?: missing("vehicle brand")
        data.model?.let { if (!sameText(input.model, it)) finding(VehicleDeviation.MODEL_MISMATCH, "Review: vehicle model '${input.model}' differs from registry '$it'. Naming differences may explain this.", DeviationOrigin.REGISTRY, row = row) } ?: missing("vehicle model")
        val relevant = data.fuels.withIndex().filter { input.fuelTechnology.code in fuelGroups(it.value.fuelTechnology?.code ?: "") }
        if (input.fuelTechnology != FuelTechnology.NOT_APPLICABLE && relevant.isEmpty()) {
            if (data.fuels.any { !knownFuel(it.fuelTechnology?.code) } || data.fuels.isEmpty()) missing("fuel technology")
            else finding(VehicleDeviation.FUEL_MISMATCH, "Reported fuel ${input.fuelTechnology.code} does not match registry fuels ${data.fuels.mapNotNull { it.fuelTechnology?.code }.joinToString()}.", DeviationOrigin.REGISTRY, DeviationPriority.HIGH, row)
        }
        if (relevant.isNotEmpty() && !input.co2Registered && relevant.any { it.value.measurements.any { m -> (m.co2GramsPerKm?.signum() ?: 0) > 0 } })
            finding(VehicleDeviation.CO2_CLASSIFICATION_MISMATCH, "Review: supplier marks this vehicle as not CO₂-emitting, but a relevant registry CO₂ measurement is positive.", DeviationOrigin.REGISTRY, row = row)
        if (input.co2Registered && data.fuels.isNotEmpty() && data.fuels.all { it.fuelTechnology?.code in setOf("5", "6") })
            finding(VehicleDeviation.CO2_CLASSIFICATION_MISMATCH, "Review: supplier marks this vehicle as CO₂-emitting but registry fuel technologies are electric/hydrogen, classified as No under the agreed reporting rules. This is not a lifecycle-emissions claim.", DeviationOrigin.REGISTRY, row = row)
        if (input.fuelTechnology.emissionsNotApplicable || input.fuelTechnology == FuelTechnology.NOT_APPLICABLE) continue
        if (relevant.isEmpty()) continue // Cannot compare emission values against another fuel technology.
        var co2Count = 0; var noxCount = 0
        val noxDistance = input.totalKmNoxRegistered!!
        val nox = if (noxDistance.signum() > 0) ratio(input.totalNoxRegisteredGrams!!.multiply(BigDecimal("1000")), noxDistance) else null
        if (nox == null && input.totalNoxRegisteredGrams!!.signum() > 0)
            finding(VehicleDeviation.UNABLE_TO_VERIFY, "Unable to calculate NOx mg/km: positive NOx grams with zero NOx-registered distance.", row = row)
        for ((fi, fuel) in relevant) for ((mi, m) in fuel.measurements.withIndex()) {
            val method = m.measurementMethod?.code ?: "unknown method"
            m.co2GramsPerKm?.let { reference ->
                co2Count++
                if (rounded(input.co2GramsPerKm!!) != rounded(reference)) {
                    val differenceKg = input.co2GramsPerKm.subtract(reference).multiply(input.totalTripKm).movePointLeft(3).stripTrailingZeros()
                    finding(VehicleDeviation.CO2_MISMATCH,
                        "Supplier CO₂ ${input.co2GramsPerKm.toPlainString()} g/km (rounded ${rounded(input.co2GramsPerKm)}) differs from registry $method ${reference.toPlainString()} g/km (rounded ${rounded(reference)}). Nominal supplier-minus-reference difference over this row: ${differenceKg.toPlainString()} kg, not measured actual emissions.",
                        DeviationOrigin.REGISTRY, row = row, fuelIndex = fi, measurementIndex = mi)
                }
            }
            m.noxMgPerKm?.let { reference ->
                noxCount++
                if (nox != null && nox != rounded(reference)) finding(VehicleDeviation.NOX_MISMATCH,
                    "Review: supplier NOx grams × 1000 ÷ NOx-registered distance rounds to $nox mg/km; registry $method ${reference.toPlainString()} rounds to ${rounded(reference)} mg/km. Reported-period and registry test-method figures are not equivalent measurements.",
                    DeviationOrigin.REGISTRY, row = row, fuelIndex = fi, measurementIndex = mi)
            }
        }
        if (co2Count == 0) missing("CO₂ measurements")
        if (nox != null && noxCount == 0) missing("NOx measurements")
    }
}
