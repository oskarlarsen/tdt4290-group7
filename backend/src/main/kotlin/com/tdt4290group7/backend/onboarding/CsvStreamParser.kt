package com.tdt4290group7.backend.onboarding

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.util.Locale

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

    val ENERGY_HEADERS = listOf(
        "agreement_id",
        "facility_location_code",
        "facility_address",
        "storage_area_sqm",
        "workshop_area_sqm",
        "other_area_sqm",
        "reporting_year",
        "electricity_kwh",
        "district_heating_kwh",
        "biogas_kwh",
        "fossil_fuel_kwh",
        "self_produced_solar_kwh",
        "self_produced_heatpump_kwh",
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
                errors = listOf(CsvCellError(1, "FILE", "The uploaded CSV file is empty")),
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
        val missingHeaders = expectedHeaders.filter { !parsedHeaderCells.contains(it) }
        if (missingHeaders.isNotEmpty()) {
            errors.add(
                CsvCellError(
                    row = 1,
                    column = "HEADER",
                    message = "Missing expected headers: ${missingHeaders.joinToString(", ")}"
                )
            )
            return ParsedCsvResult(headers = parsedHeaderCells, rows = emptyList(), errors = errors, totalRows = totalRows)
        }

        val rows = mutableListOf<Map<String, String>>()
        val seenEnergyKeys = mutableSetOf<Triple<String, String, String>>()
        val seenProductKeys = mutableSetOf<Pair<String, String>>()

        for (i in 1 until rawLines.size) {
            val rowNum = i + 1
            val cells = parseCsvLine(rawLines[i], delimiter)

            if (cells.size != parsedHeaderCells.size) {
                errors.add(
                    CsvCellError(
                        row = rowNum,
                        column = "STRUCTURE",
                        message = "Row has ${cells.size} columns, expected ${parsedHeaderCells.size}"
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
                            message = "Potential formula injection: value must not start with '=', '+', '-', '@' or tabs",
                            value = rawVal
                        )
                    )
                }
            }

            // 2. Validate tenant agreement_id ownership
            val agreementId = rowMap["agreement_id"]?.trim() ?: ""
            if (agreementId.isEmpty()) {
                errors.add(CsvCellError(rowNum, "agreement_id", "agreement_id cannot be blank"))
            } else if (!allowedAgreementIds.contains(agreementId)) {
                errors.add(
                    CsvCellError(
                        row = rowNum,
                        column = "agreement_id",
                        message = "Agreement '$agreementId' does not exist or does not belong to your organization",
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
                    val key = Triple(
                        rowMap["agreement_id"]?.trim().orEmpty(),
                        rowMap["facility_location_code"]?.trim().orEmpty(),
                        rowMap["reporting_year"]?.trim().orEmpty()
                    )
                    if (key.toList().all { it.isNotEmpty() } && !seenEnergyKeys.add(key)) {
                        errors.add(
                            CsvCellError(rowNum, "facility_location_code", "Duplicate energy record for this agreement, facility, and reporting year")
                        )
                    }
                }
                BatchEntityType.PRODUCTS -> {
                    val key = rowMap["agreement_id"]?.trim().orEmpty() to
                        rowMap["product_code"]?.trim().orEmpty()
                    if (key.first.isNotEmpty() && key.second.isNotEmpty() && !seenProductKeys.add(key)) {
                        errors.add(CsvCellError(rowNum, "product_code", "Duplicate product code for this agreement"))
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
        validateBoolean(row, "is_hybrid", rowMap["is_hybrid"], errors)
        val isPlannedStr = rowMap["is_planned"]?.trim()?.uppercase(Locale.ROOT)
        val isPlanned = isPlannedStr == "TRUE" || isPlannedStr == "1"

        if (isPlannedStr != "TRUE" && isPlannedStr != "FALSE" && isPlannedStr != "1" && isPlannedStr != "0") {
            errors.add(CsvCellError(row, "is_planned", "is_planned must be TRUE or FALSE", rowMap["is_planned"]))
        }

        val regNumber = rowMap["registration_number"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        if (isPlanned) {
            if (regNumber.isNotEmpty()) {
                errors.add(CsvCellError(row, "registration_number", "Planned vehicles must leave registration_number empty", regNumber))
            }
        } else {
            if (regNumber.isEmpty()) {
                errors.add(CsvCellError(row, "registration_number", "registration_number is required when is_planned is FALSE"))
            } else if (!regNumber.matches(REGISTRATION_NUMBER_REGEX)) {
                errors.add(CsvCellError(row, "registration_number", "Invalid Norwegian registration number format (e.g. AB12345)", regNumber))
            }
        }

        val fuel = rowMap["fuel_technology"]?.trim() ?: ""
        if (fuel.isEmpty()) {
            errors.add(CsvCellError(row, "fuel_technology", "fuel_technology cannot be blank"))
        }

        val fullCoverageStr = rowMap["full_contract_coverage"]?.trim()?.uppercase(Locale.ROOT)
        val fullCoverage = fullCoverageStr == "TRUE" || fullCoverageStr == "1"
        if (fullCoverageStr != "TRUE" && fullCoverageStr != "FALSE" && fullCoverageStr != "1" && fullCoverageStr != "0") {
            errors.add(CsvCellError(row, "full_contract_coverage", "full_contract_coverage must be TRUE or FALSE", rowMap["full_contract_coverage"]))
        }

        if (!fullCoverage) {
            val startWeek = rowMap["start_year_week"]?.trim() ?: ""
            val endWeek = rowMap["end_year_week"]?.trim() ?: ""

            if (startWeek.isEmpty() || !startWeek.matches(YEAR_WEEK_REGEX)) {
                errors.add(CsvCellError(row, "start_year_week", "start_year_week is required when full_contract_coverage is FALSE (format: YYYY-Www)", startWeek))
            }
            if (endWeek.isEmpty() || !endWeek.matches(YEAR_WEEK_REGEX)) {
                errors.add(CsvCellError(row, "end_year_week", "end_year_week is required when full_contract_coverage is FALSE (format: YYYY-Www)", endWeek))
            }
            if (startWeek.isNotEmpty() && endWeek.isNotEmpty() && startWeek > endWeek) {
                errors.add(CsvCellError(row, "end_year_week", "end_year_week must not be earlier than start_year_week", endWeek))
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
            errors.add(CsvCellError(row, "facility_location_code", "facility_location_code cannot be blank"))
        }

        val address = rowMap["facility_address"]?.trim() ?: ""
        if (address.isEmpty()) {
            errors.add(CsvCellError(row, "facility_address", "facility_address cannot be blank"))
        }

        val yearStr = rowMap["reporting_year"]?.trim() ?: ""
        val year = yearStr.toIntOrNull()
        if (year == null || year !in 2020..2030) {
            errors.add(CsvCellError(row, "reporting_year", "reporting_year must be an integer between 2020 and 2030", yearStr))
        }

        val decimalCols = listOf(
            "electricity_kwh", "district_heating_kwh", "biogas_kwh", "fossil_fuel_kwh",
            "self_produced_solar_kwh", "self_produced_heatpump_kwh"
        ) + listOf("storage_area_sqm", "workshop_area_sqm", "other_area_sqm")
        for (col in decimalCols) {
            val raw = rowMap[col]?.trim() ?: ""
            if (raw.isNotEmpty()) {
                val d = raw.toDoubleOrNull()
                if (d == null || !d.isFinite() || d < 0.0) {
                    errors.add(CsvCellError(row, col, "$col must be a positive decimal number (use dot as separator)", raw))
                }
            } else if (col == "electricity_kwh" || col == "district_heating_kwh") {
                errors.add(CsvCellError(row, col, "$col is required"))
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
            errors.add(CsvCellError(row, "product_code", "product_code cannot be blank"))
        }

        val pName = rowMap["product_name"]?.trim() ?: ""
        if (pName.isEmpty()) {
            errors.add(CsvCellError(row, "product_name", "product_name cannot be blank"))
        }

        val categoryStr = rowMap["product_category"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        val categoryValid = ProductCategory.entries.any { it.name == categoryStr }
        if (!categoryValid) {
            errors.add(
                CsvCellError(
                    row = row,
                    column = "product_category",
                    message = "Invalid product category. Allowed: ${ProductCategory.entries.joinToString()}",
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
                    message = "Invalid ecolabel standard. Allowed: ${EcolabelStandard.entries.joinToString()}",
                    value = ecoStr
                )
            )
        } else if (ecoStr != EcolabelStandard.NONE.name) {
            val lic = rowMap["license_number"]?.trim() ?: ""
            if (lic.isEmpty()) {
                errors.add(CsvCellError(row, "license_number", "license_number is required when ecolabel_standard is not NONE"))
            }
        }

        val unit = rowMap["unit_of_measure"]?.trim()?.uppercase(Locale.ROOT) ?: ""
        if (unit !in setOf("PCS", "KG", "LITRE")) {
            errors.add(CsvCellError(row, "unit_of_measure", "unit_of_measure must be PCS, KG, or LITRE", unit))
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
            errors.add(CsvCellError(row, column, "$column must be TRUE or FALSE", raw))
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
            BatchEntityType.VEHICLES -> VEHICLE_HEADERS
            BatchEntityType.ENERGY -> ENERGY_HEADERS
            BatchEntityType.PRODUCTS -> PRODUCT_HEADERS
        }
        return "\uFEFF" + headers.joinToString(";") + "\r\n"
    }
}
