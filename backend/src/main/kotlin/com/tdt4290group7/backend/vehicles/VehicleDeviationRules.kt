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
            "${vehicle.registrationNumber} står ikke på avtalens gjeldende kjøretøyliste.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH)
        today.toString() < dates.startDate -> finding(VehicleDeviation.AGREEMENT_NOT_STARTED,
            "Leverandørens avtale starter ${dates.startDate}.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH)
        today.toString() > dates.endDate -> finding(VehicleDeviation.AGREEMENT_EXPIRED,
            "Leverandørens avtale utløp ${dates.endDate}.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH)
    }
    val orderedRows = rows.sortedBy { it.data.periodStart }
    var furthest: StoredTripRow? = null
    for (b in orderedRows) {
        val a = furthest
        if (a != null && b.data.periodStart <= a.data.periodEnd) finding(VehicleDeviation.OVERLAPPING_STATISTICS,
            "Vurder: rapporteringsperiodene ${a.data.periodStart}–${a.data.periodEnd} og ${b.data.periodStart}–${b.data.periodEnd} overlapper. Radene beholdes hver for seg og summeres ikke.",
            row = b, relatedRow = a)
        if (a == null || b.data.periodEnd > a.data.periodEnd) furthest = b
    }
    if (registry.dataSource in setOf(RegistryDataSource.UNAVAILABLE, RegistryDataSource.STALE_CACHE))
        finding(VehicleDeviation.UNABLE_TO_VERIFY,
            "Kunne ikke bekrefte gjeldende registeropplysninger (${(registry.refreshFailure ?: registry.lookupOutcome).nb}). ${if (registry.data != null) "Sammenligningene bruker eldre opplysninger hentet ${registry.fetchedAt}." else "Ingen registeropplysninger er tilgjengelige."}",
            DeviationOrigin.REGISTRY)
    val data = registry.data
    if (data != null) {
        for ((fi, fuel) in data.fuels.withIndex()) {
            val co2 = fuel.measurements.mapNotNull { m -> m.co2GramsPerKm?.let { "${m.measurementMethod?.code ?: "ukjent metode"}: ${it.toPlainString()} g/km (avrundet ${rounded(it)})" } }
            if (fuel.measurements.mapNotNull { it.co2GramsPerKm?.let(::rounded) }.distinct().size > 1)
                finding(VehicleDeviation.REGISTRY_CO2_DISAGREEMENT,
                    "Vurder: CO₂-målingene fra Statens vegvesen avviker for drivstoff ${fuel.fuelTechnology?.code ?: "ukjent"}: ${co2.joinToString("; ")}. Ulike målemetoder kan forklare avviket.",
                    DeviationOrigin.REGISTRY, fuelIndex = fi)
        }
    }
    for (row in rows) {
        val input = row.data
        if (dates != null && (input.periodStart < dates.startDate || input.periodEnd > dates.endDate))
            finding(VehicleDeviation.AGREEMENT_PERIOD_NOT_COVERED, "Rapporteringsperioden ${input.periodStart} til ${input.periodEnd} går utenfor avtalens datoer.", DeviationOrigin.AGREEMENT, DeviationPriority.HIGH, row)
        if (input.fuelTechnology.usesLitres) {
            if (input.totalTripKm.signum() > 0) {
                val computed = ratio(input.fuelConsumedLitres!!.multiply(BigDecimal("100")), input.totalTripKm)
                val reported = rounded(input.averageFuelConsumptionLitresPer100Km!!)
                if (computed != reported) finding(VehicleDeviation.CONSUMPTION_MISMATCH,
                    "Vurder: oppgitt gjennomsnitt ${input.averageFuelConsumptionLitresPer100Km.toPlainString()} L/100 km avrundes til $reported; totalt antall liter × 100 ÷ total distanse avrundes til $computed L/100 km. Beregningen forutsetter samme rapporteringsomfang.", row = row)
            } else if (input.fuelConsumedLitres!!.signum() > 0 || input.averageFuelConsumptionLitresPer100Km!!.signum() > 0)
                finding(VehicleDeviation.UNABLE_TO_VERIFY, "Kunne ikke beregne drivstofforbruk: total distanse er null, men drivstoff/gjennomsnittsforbruk er positivt.", row = row)
        }
        if (data == null) continue
        fun missing(label: String) = finding(VehicleDeviation.UNABLE_TO_VERIFY, "Kunne ikke bekrefte $label for denne raden: den aktuelle registerverdien mangler.", DeviationOrigin.REGISTRY, row = row)
        data.vehicleCategory?.code?.let { code -> if (categoryGroup(code) != input.vehicleCategory.name)
            finding(VehicleDeviation.CATEGORY_MISMATCH, "Oppgitt kategori ${input.vehicleCategory} avviker fra registerkategori $code (gruppe ${categoryGroup(code)}).", DeviationOrigin.REGISTRY, DeviationPriority.HIGH, row) } ?: missing("kjøretøykategori")
        data.bodyType?.code?.let { code -> if (code != input.bodyType.name)
            finding(VehicleDeviation.BODY_TYPE_MISMATCH, "Vurder: oppgitt karosseritype ${input.bodyType} avviker fra registrert karosseritype $code.", DeviationOrigin.REGISTRY, row = row) } ?: missing("karosseritype")
        data.make?.let { if (!sameText(input.make, it)) finding(VehicleDeviation.BRAND_MISMATCH, "Vurder: kjøretøymerket «${input.make}» avviker fra registeret «$it». Ulik skrivemåte kan forklare dette.", DeviationOrigin.REGISTRY, row = row) } ?: missing("kjøretøymerke")
        data.model?.let { if (!sameText(input.model, it)) finding(VehicleDeviation.MODEL_MISMATCH, "Vurder: kjøretøymodellen «${input.model}» avviker fra registeret «$it». Ulik skrivemåte kan forklare dette.", DeviationOrigin.REGISTRY, row = row) } ?: missing("kjøretøymodell")
        val relevant = data.fuels.withIndex().filter { input.fuelTechnology.code in fuelGroups(it.value.fuelTechnology?.code ?: "") }
        if (input.fuelTechnology != FuelTechnology.NOT_APPLICABLE && relevant.isEmpty()) {
            if (data.fuels.any { !knownFuel(it.fuelTechnology?.code) } || data.fuels.isEmpty()) missing("drivstoffteknologi")
            else finding(VehicleDeviation.FUEL_MISMATCH, "Oppgitt drivstoff ${input.fuelTechnology.code} samsvarer ikke med registrert drivstoff ${data.fuels.mapNotNull { it.fuelTechnology?.code }.joinToString()}.", DeviationOrigin.REGISTRY, DeviationPriority.HIGH, row)
        }
        if (relevant.isNotEmpty() && !input.co2Registered && relevant.any { it.value.measurements.any { m -> (m.co2GramsPerKm?.signum() ?: 0) > 0 } })
            finding(VehicleDeviation.CO2_CLASSIFICATION_MISMATCH, "Vurder: leverandøren har oppgitt at kjøretøyet ikke slipper ut CO₂, men en relevant CO₂-måling i registeret er positiv.", DeviationOrigin.REGISTRY, row = row)
        if (input.co2Registered && data.fuels.isNotEmpty() && data.fuels.all { it.fuelTechnology?.code in setOf("5", "6") })
            finding(VehicleDeviation.CO2_CLASSIFICATION_MISMATCH, "Vurder: leverandøren har oppgitt at kjøretøyet slipper ut CO₂, men registrert drivstoffteknologi er elektrisk/hydrogen, som klassifiseres som Nei etter de avtalte rapporteringsreglene. Dette er ikke en påstand om livsløpsutslipp.", DeviationOrigin.REGISTRY, row = row)
        if (input.fuelTechnology.emissionsNotApplicable || input.fuelTechnology == FuelTechnology.NOT_APPLICABLE) continue
        if (relevant.isEmpty()) continue // Cannot compare emission values against another fuel technology.
        var co2Count = 0; var noxCount = 0
        val noxDistance = input.totalKmNoxRegistered!!
        val nox = if (noxDistance.signum() > 0) ratio(input.totalNoxRegisteredGrams!!.multiply(BigDecimal("1000")), noxDistance) else null
        if (nox == null && input.totalNoxRegisteredGrams!!.signum() > 0)
            finding(VehicleDeviation.UNABLE_TO_VERIFY, "Kunne ikke beregne NOx mg/km: positive NOx-gram med null NOx-registrert distanse.", row = row)
        for ((fi, fuel) in relevant) for ((mi, m) in fuel.measurements.withIndex()) {
            val method = m.measurementMethod?.code ?: "ukjent metode"
            m.co2GramsPerKm?.let { reference ->
                co2Count++
                if (rounded(input.co2GramsPerKm!!) != rounded(reference)) {
                    val differenceKg = input.co2GramsPerKm.subtract(reference).multiply(input.totalTripKm).movePointLeft(3).stripTrailingZeros()
                    finding(VehicleDeviation.CO2_MISMATCH,
                        "Leverandørens CO₂ ${input.co2GramsPerKm.toPlainString()} g/km (avrundet ${rounded(input.co2GramsPerKm)}) avviker fra registeret $method ${reference.toPlainString()} g/km (avrundet ${rounded(reference)}). Nominell differanse mellom leverandør og referanse for denne raden: ${differenceKg.toPlainString()} kg, ikke målte faktiske utslipp.",
                        DeviationOrigin.REGISTRY, row = row, fuelIndex = fi, measurementIndex = mi)
                }
            }
            m.noxMgPerKm?.let { reference ->
                noxCount++
                if (nox != null && nox != rounded(reference)) finding(VehicleDeviation.NOX_MISMATCH,
                    "Vurder: leverandørens NOx-gram × 1000 ÷ NOx-registrert distanse avrundes til $nox mg/km; registeret $method ${reference.toPlainString()} avrundes til ${rounded(reference)} mg/km. Tall fra rapporteringsperioden og fra registerets testmetode er ikke likeverdige målinger.",
                    DeviationOrigin.REGISTRY, row = row, fuelIndex = fi, measurementIndex = mi)
            }
        }
        if (co2Count == 0) missing("CO₂-målinger")
        if (nox != null && noxCount == 0) missing("NOx-målinger")
    }
}
