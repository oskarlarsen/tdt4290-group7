package com.tdt4290group7.backend.onboarding

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.util.Locale
import com.tdt4290group7.backend.vehicles.FuelTechnology

object CsvStreamParser {

    private val FORMULA_PREFIXES = charArrayOf('=', '+', '-', '@', '\t', '\r')
    private val REGISTRATION_NUMBER_REGEX = Regex("^[A-Z]{2}[1-9][0-9]{3,4}$")
    private val YEAR_WEEK_REGEX = Regex("^\\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$")

    val VEHICLE_HEADERS = listOf(
        "agreement_id",
        "registration_number",
        "is_planned",
        "fuel_technology",
        "is_hybrid",
        "full_contract_coverage",
        "start_year_week",
        "end_year_week",
        "attachment_reference",
        "notes"
    )

    /**
     * Statens vegvesen fills these in at upload preview when they are left blank, so a file without them is still valid.
     * Old templates that include them keep working.
     */
    val OPTIONAL_VEHICLE_HEADERS = setOf("fuel_technology", "is_hybrid")

    /** The columns a supplier is asked to fill in. is_hybrid is still accepted, but derived when left out. */
    val VEHICLE_TEMPLATE_HEADERS get() = VEHICLE_HEADERS.filter { it != "is_hybrid" }

    val ENERGY_HEADERS = listOf(
        "agreement_id",
        "facility_location_code",
        "facility_address",
        "storage_area_sqm",
        "workshop_area_sqm",
        "other_area_sqm",
        "reporting_year",
        "reporting_quarter",
        "electricity_kwh",
        "district_heating_kwh",
        "biogas_kwh",
        "fossil_fuel_kwh",
        "self_produced_solar_kwh",
        "self_produced_heatpump_kwh",
        "goo_covered_kwh",
        "notes"
    )

    val PRODUCT_HEADERS = listOf(
        "agreement_id",
        "product_code",
        "product_name",
        "product_category",
        "ecolabel_standard",
        "license_number",
        "unit_of_measure",
        "is_repaired_or_reused",
        "notes"
    )

    data class ParsedCsvResult(
        val headers: List<String>,
        val rows: List<Map<String, String>>,
        val errors: List<CsvCellError>,
        val totalRows: Int
    )

    fun parseAndValidate(
        inputStream: InputStream,
        entityType: BatchEntityType,
        allowedAgreementIds: Set<String>
    ): ParsedCsvResult {
        val reader = BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8))
        val rawLines = mutableListOf<String>()
        var line = reader.readLine()

        // Strip UTF-8 BOM if present on the first line
        if (line != null && line.startsWith("\uFEFF")) {
            line = line.substring(1)
        }

        while (line != null) {
            if (line.trim().isNotEmpty()) {
                rawLines.add(line)
            }
            line = reader.readLine()
        }

        if (rawLines.isEmpty()) {
            return ParsedCsvResult(
                headers = emptyList(),
                rows = emptyList(),
                errors = listOf(CsvCellError(1, "FILE", "Den opplastede CSV-filen er tom")),
                totalRows = 0
            )
        }
        val totalRows = (rawLines.size - 1).coerceAtLeast(0)

        val expectedHeaders = when (entityType) {
            BatchEntityType.VEHICLES -> VEHICLE_HEADERS
            BatchEntityType.ENERGY -> ENERGY_HEADERS
            BatchEntityType.PRODUCTS -> PRODUCT_HEADERS
        }

        val delimiter = detectDelimiter(rawLines[0])
        val parsedHeaderCells = parseCsvLine(rawLines[0], delimiter).map { it.trim().lowercase(Locale.ROOT) }
        val errors = mutableListOf<CsvCellError>()

        // Check required headers
        val optionalHeaders = if (entityType == BatchEntityType.VEHICLES) OPTIONAL_VEHICLE_HEADERS else emptySet()
        val missingHeaders = expectedHeaders.filter { it !in optionalHeaders && !parsedHeaderCells.contains(it) }
        if (missingHeaders.isNotEmpty()) {
            errors.add(
                CsvCellError(
                    row = 1,
                    column = "HEADER",
                    message = "Mangler forventede kolonneoverskrifter: ${missingHeaders.joinToString(", ")}"
                )
            )
            return ParsedCsvResult(headers = parsedHeaderCells, rows = emptyList(), errors = errors, totalRows = totalRows)
        }

        val rows = mutableListOf<Map<String, String>>()
        val seenEnergyKeys = mutableSetOf<List<String>>()
        val seenProductKeys = mutableSetOf<Pair<String, String>>()

        for (i in 1 until rawLines.size) {
            val rowNum = i + 1
            val cells = parseCsvLine(rawLines[i], delimiter)

            if (cells.size != parsedHeaderCells.size) {
                errors.add(
                    CsvCellError(
                        row = rowNum,
                        column = "STRUCTURE",
                        message = "Raden har ${cells.size} kolonner, forventet ${parsedHeaderCells.size}"
                    )
                )
                continue
            }

            val rowMap = parsedHeaderCells.zip(cells).toMap()

            // 1. Check formula injection for each cell
            for ((col, rawVal) in rowMap) {
                val trimmed = rawVal.trim()
                if (trimmed.isNotEmpty() && FORMULA_PREFIXES.contains(trimmed[0])) {
                    errors.add(
                        CsvCellError(
                            row = rowNum,
                            column = col,
                            message = "Mulig formelinjeksjon: verdien kan ikke starte med «=», «+», «-», «@» eller tabulator",
                            value = rawVal
                        )
                    )
                }
            }

            // 2. Validate tenant agreement_id ownership
            val agreementId = rowMap["agreement_id"]?.trim() ?: ""
            if (agreementId.isEmpty()) {
                errors.add(CsvCellError(rowNum, "agreement_id", "agreement_id kan ikke være tom"))
            } else if (!allowedAgreementIds.contains(agreementId)) {
                errors.add(
                    CsvCellError(
                        row = rowNum,
                        column = "agreement_id",
                        message = "Avtalen «$agreementId» finnes ikke eller tilhører ikke organisasjonen din",
                        value = agreementId
                    )
                )
            }

            // 3. Entity-specific validations
            when (entityType) {
                BatchEntityType.VEHICLES -> validateVehicleRow(rowNum, rowMap, errors)
                BatchEntityType.ENERGY -> validateEnergyRow(rowNum, rowMap, errors)
                BatchEntityType.PRODUCTS -> validateProductRow(rowNum, rowMap, errors)
            }

            when (entityType) {
                BatchEntityType.VEHICLES -> Unit
                BatchEntityType.ENERGY -> {
                    val key = listOf(
                        rowMap["agreement_id"]?.trim().orEmpty(),
                        rowMap["facility_location_code"]?.trim().orEmpty(),
                        rowMap["reporting_year"]?.trim().orEmpty(),
                        rowMap["reporting_quarter"]?.trim().orEmpty()
                    )
                    if (key.all { it.isNotEmpty() } && !seenEnergyKeys.add(key)) {
                        errors.add(
                            CsvCellError(rowNum, "facility_location_code", "Duplisert energiregistrering for ${key[1]} i ${key[2]} Q${key[3]} på denne avtalen")
                        )
                    }
                }
                BatchEntityType.PRODUCTS -> {
                    val key = rowMap["agreement_id"]?.trim().orEmpty() to
                        rowMap["product_code"]?.trim().orEmpty()
                    if (key.first.isNotEmpty() && key.second.isNotEmpty() && !seenProductKeys.add(key)) {
                        errors.add(CsvCellError(rowNum, "product_code", "Duplisert produktkode for denne avtalen"))
                    }
                }
            }

            rows.add(rowMap)
        }

        return ParsedCsvResult(headers = parsedHeaderCells, rows = rows, errors = errors, totalRows = totalRows)
    }

    private fun validateVehicleRow(
        row: Int,
        rowMap: Map<String, String>,
        errors: MutableList<CsvCellError>
    ) {
        // Blank is allowed: the hybrid flag is worked out from the fuel at preview.
        if (!rowMap["is_hybrid"].isNullOrBlank()) validateBoolean(row, "is_hybrid", rowMap["is_hybrid"], errors)
        val isPlannedStr = rowMap["is_planned"]?.trim()?.uppercase(Locale.ROOT)
        val isPlanned = isPlannedStr == "TRUE" || isPlannedStr == "1"

        if (isPlannedStr != "TRUE" && isPlannedStr != "FALSE" && isPlannedStr != "1" && isPlannedStr != "0") {
            errors.add(CsvCellError(row, "is_planned", "is_planned må være TRUE eller FALSE", rowMap["is_planned"]))
        }

        val regNumber = rowMap["registration_number"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        if (isPlanned) {
            if (regNumber.isNotEmpty()) {
                errors.add(CsvCellError(row, "registration_number", "Planlagte kjøretøy må la registration_number stå tom", regNumber))
            }
        } else {
            if (regNumber.isEmpty()) {
                errors.add(CsvCellError(row, "registration_number", "registration_number er påkrevd når is_planned er FALSE"))
            } else if (!regNumber.matches(REGISTRATION_NUMBER_REGEX)) {
                errors.add(CsvCellError(row, "registration_number", "Ugyldig norsk registreringsnummer (f.eks. AB12345)", regNumber))
            }
        }

        // A registered vehicle's fuel is looked up at preview. A planned vehicle has no plate to look up, so it needs one.
        val fuel = rowMap["fuel_technology"]?.trim() ?: ""
        if (fuel.isEmpty() && isPlanned) {
            errors.add(CsvCellError(row, "fuel_technology", "fuel_technology er påkrevd for planlagte kjøretøy: de har ikke registreringsnummer å slå opp"))
        }
        if (fuel.isNotEmpty() && FuelTechnology.entries.none { it.code == fuel }) {
            errors.add(CsvCellError(row, "fuel_technology", "fuel_technology må være en drivstoffkode fra Statens vegvesen, for eksempel 2 for diesel", fuel))
        }

        val fullCoverageStr = rowMap["full_contract_coverage"]?.trim()?.uppercase(Locale.ROOT)
        val fullCoverage = fullCoverageStr == "TRUE" || fullCoverageStr == "1"
        if (fullCoverageStr != "TRUE" && fullCoverageStr != "FALSE" && fullCoverageStr != "1" && fullCoverageStr != "0") {
            errors.add(CsvCellError(row, "full_contract_coverage", "full_contract_coverage må være TRUE eller FALSE", rowMap["full_contract_coverage"]))
        }

        if (!fullCoverage) {
            val startWeek = rowMap["start_year_week"]?.trim() ?: ""
            val endWeek = rowMap["end_year_week"]?.trim() ?: ""

            if (startWeek.isEmpty() || !startWeek.matches(YEAR_WEEK_REGEX)) {
                errors.add(CsvCellError(row, "start_year_week", "start_year_week er påkrevd når full_contract_coverage er FALSE (format: ÅÅÅÅ-Uuu)", startWeek))
            }
            if (endWeek.isEmpty() || !endWeek.matches(YEAR_WEEK_REGEX)) {
                errors.add(CsvCellError(row, "end_year_week", "end_year_week er påkrevd når full_contract_coverage er FALSE (format: ÅÅÅÅ-Uuu)", endWeek))
            }
            if (startWeek.isNotEmpty() && endWeek.isNotEmpty() && startWeek > endWeek) {
                errors.add(CsvCellError(row, "end_year_week", "end_year_week kan ikke være tidligere enn start_year_week", endWeek))
            }
        }
    }

    private fun validateEnergyRow(
        row: Int,
        rowMap: Map<String, String>,
        errors: MutableList<CsvCellError>
    ) {
        val location = rowMap["facility_location_code"]?.trim() ?: ""
        if (location.isEmpty()) {
            errors.add(CsvCellError(row, "facility_location_code", "facility_location_code kan ikke være tom"))
        }

        val address = rowMap["facility_address"]?.trim() ?: ""
        if (address.isEmpty()) {
            errors.add(CsvCellError(row, "facility_address", "facility_address kan ikke være tom"))
        }

        val yearStr = rowMap["reporting_year"]?.trim() ?: ""
        val year = yearStr.toIntOrNull()
        if (year == null || year !in 2020..2030) {
            errors.add(CsvCellError(row, "reporting_year", "reporting_year må være et heltall mellom 2020 og 2030", yearStr))
        }

        val quarterStr = rowMap["reporting_quarter"]?.trim() ?: ""
        if (quarterStr.toIntOrNull() !in 1..4) {
            errors.add(CsvCellError(row, "reporting_quarter", "reporting_quarter må være 1, 2, 3 eller 4", quarterStr))
        }

        val decimalCols = listOf(
            "electricity_kwh", "district_heating_kwh", "biogas_kwh", "fossil_fuel_kwh",
            "self_produced_solar_kwh", "self_produced_heatpump_kwh", "goo_covered_kwh"
        ) + listOf("storage_area_sqm", "workshop_area_sqm", "other_area_sqm")
        for (col in decimalCols) {
            val raw = rowMap[col]?.trim() ?: ""
            if (raw.isNotEmpty()) {
                val d = raw.toDoubleOrNull()
                if (d == null || !d.isFinite() || d < 0.0) {
                    errors.add(CsvCellError(row, col, "$col må være et positivt desimaltall (bruk punktum som skilletegn)", raw))
                }
            } else if (col == "electricity_kwh" || col == "district_heating_kwh") {
                errors.add(CsvCellError(row, col, "$col er påkrevd"))
            }
        }
    }

    private fun validateProductRow(
        row: Int,
        rowMap: Map<String, String>,
        errors: MutableList<CsvCellError>
    ) {
        val pCode = rowMap["product_code"]?.trim() ?: ""
        if (pCode.isEmpty()) {
            errors.add(CsvCellError(row, "product_code", "product_code kan ikke være tom"))
        }

        val pName = rowMap["product_name"]?.trim() ?: ""
        if (pName.isEmpty()) {
            errors.add(CsvCellError(row, "product_name", "product_name kan ikke være tom"))
        }

        val categoryStr = rowMap["product_category"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        val categoryValid = ProductCategory.entries.any { it.name == categoryStr }
        if (!categoryValid) {
            errors.add(
                CsvCellError(
                    row = row,
                    column = "product_category",
                    message = "Ugyldig produktkategori. Tillatt: ${ProductCategory.entries.joinToString()}",
                    value = categoryStr
                )
            )
        }

        val ecoStr = rowMap["ecolabel_standard"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        val ecoValid = EcolabelStandard.entries.any { it.name == ecoStr }
        if (!ecoValid) {
            errors.add(
                CsvCellError(
                    row = row,
                    column = "ecolabel_standard",
                    message = "Ugyldig miljømerkestandard. Tillatt: ${EcolabelStandard.entries.joinToString()}",
                    value = ecoStr
                )
            )
        } else if (ecoStr != EcolabelStandard.NONE.name) {
            val lic = rowMap["license_number"]?.trim() ?: ""
            if (lic.isEmpty()) {
                errors.add(CsvCellError(row, "license_number", "license_number er påkrevd når ecolabel_standard ikke er NONE"))
            }
        }

        val unit = rowMap["unit_of_measure"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        if (unit !in setOf("PCS", "KG", "LITRE")) {
            errors.add(CsvCellError(row, "unit_of_measure", "unit_of_measure må være PCS, KG eller LITRE", unit))
        }
        validateBoolean(row, "is_repaired_or_reused", rowMap["is_repaired_or_reused"], errors)
    }

    private fun validateBoolean(
        row: Int,
        column: String,
        raw: String?,
        errors: MutableList<CsvCellError>
    ) {
        val value = raw?.trim()?.uppercase(Locale.ROOT)
        if (value !in setOf("TRUE", "FALSE", "1", "0")) {
            errors.add(CsvCellError(row, column, "$column må være TRUE eller FALSE", raw))
        }
    }

    /**
     * Minimal RFC 4180 CSV line parser supporting quoted fields and embedded commas.
     */
    private fun detectDelimiter(header: String): Char {
        var inQuotes = false
        var commas = 0
        var semicolons = 0
        var i = 0
        while (i < header.length) {
            when (val c = header[i]) {
                '"' -> {
                    if (inQuotes && i + 1 < header.length && header[i + 1] == '"') {
                        i++
                    } else {
                        inQuotes = !inQuotes
                    }
                }
                ',' -> if (!inQuotes) commas++
                ';' -> if (!inQuotes) semicolons++
            }
            i++
        }
        return if (semicolons > commas) ';' else ','
    }

    fun parseCsvLine(line: String, delimiter: Char = ','): List<String> {
        val result = mutableListOf<String>()
        val sb = StringBuilder()
        var inQuotes = false
        var i = 0

        while (i < line.length) {
            val c = line[i]
            if (c == '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] == '"') {
                    sb.append('"')
                    i++ // skip escaped quote
                } else {
                    inQuotes = !inQuotes
                }
            } else if (c == delimiter && !inQuotes) {
                result.add(sb.toString().trim())
                sb.clear()
            } else {
                sb.append(c)
            }
            i++
        }
        result.add(sb.toString().trim())
        return result
    }

    fun generateTemplate(entityType: BatchEntityType): String {
        val headers = when (entityType) {
            // The hybrid flag is worked out from the fuel, so the template does not ask for it; files that include it still work.
            BatchEntityType.VEHICLES -> VEHICLE_TEMPLATE_HEADERS
            BatchEntityType.ENERGY -> ENERGY_HEADERS
            BatchEntityType.PRODUCTS -> PRODUCT_HEADERS
        }
        return "\uFEFF" + headers.joinToString(";") + "\r\n"
    }
}
