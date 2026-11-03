package com.tdt4290group7.backend.vehicles

private data class CsvRecord(val line: Int, val fields: List<String>)
private data class CsvParseResult(val records: List<CsvRecord>, val issues: List<ContractCsvIssue>)

internal fun parseContractCsv(text: String): ContractCsvPreview {
    if (text.length > 2 * 1024 * 1024) {
        return ContractCsvPreview(emptyList(), listOf(ContractCsvIssue(1, "file", "CSV must be no larger than 2 MB")))
    }

    val parsed = parseCsvRecords(text)
    if (parsed.records.isEmpty()) {
        val issues = parsed.issues.ifEmpty { listOf(ContractCsvIssue(1, "file", "CSV is empty")) }
        return ContractCsvPreview(emptyList(), issues)
    }

    val expectedHeaders = listOf("contractName", "contractReference", "startDate", "endDate")
    val headers = parsed.records.first().fields.mapIndexed { index, value ->
        (if (index == 0) value.removePrefix("\uFEFF") else value).trim()
    }
    if (headers != expectedHeaders) {
        return ContractCsvPreview(
            emptyList(),
            parsed.issues + ContractCsvIssue(
                parsed.records.first().line,
                "header",
                "Expected columns in this order: ${expectedHeaders.joinToString(",")}",
            ),
        )
    }

    val validRows = mutableListOf<ContractCsvRow>()
    val issues = parsed.issues.toMutableList()
    val seenReferences = mutableSetOf<String>()
    parsed.records.drop(1).forEach { record ->
        if (record.fields.all(String::isBlank)) return@forEach
        if (validRows.size + issues.size >= 5000) {
            issues += ContractCsvIssue(record.line, "file", "CSV cannot contain more than 5000 data rows")
            return@forEach
        }
        if (record.fields.size != expectedHeaders.size) {
            issues += ContractCsvIssue(record.line, "row", "Expected ${expectedHeaders.size} columns, found ${record.fields.size}")
            return@forEach
        }

        val (name, reference, startDate, endDate) = record.fields.map(String::trim)
        var rowValid = true
        fun issue(field: String, message: String) {
            issues += ContractCsvIssue(record.line, field, message)
            rowValid = false
        }

        if (name.isEmpty() || name.length > 200) issue("contractName", "Name is required and must be at most 200 characters")
        if (reference.isEmpty() || reference.length > 120) {
            issue("contractReference", "Reference is required and must be at most 120 characters")
        } else if (!seenReferences.add(reference.lowercase())) {
            issue("contractReference", "Duplicate contract reference in this CSV")
        }

        val start = parseDate(startDate)
        val end = parseDate(endDate)
        if (start == null) issue("startDate", "Use a valid date in YYYY-MM-DD format")
        if (end == null) issue("endDate", "Use a valid date in YYYY-MM-DD format")
        if (start != null && end != null && start.isAfter(end)) {
            issue("endDate", "End date must be on or after start date")
        }

        if (rowValid) validRows += ContractCsvRow(record.line, name, reference, startDate, endDate)
    }
    return ContractCsvPreview(validRows, issues)
}

private fun parseDate(value: String) = try {
    if (!value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) null else java.time.LocalDate.parse(value)
} catch (_: java.time.format.DateTimeParseException) {
    null
}

private fun parseCsvRecords(text: String): CsvParseResult {
    val records = mutableListOf<CsvRecord>()
    val issues = mutableListOf<ContractCsvIssue>()
    val fields = mutableListOf<String>()
    val field = StringBuilder()
    var inQuotes = false
    var afterQuote = false
    var line = 1
    var recordLine = 1
    var index = 0
    var malformed = false

    fun finishField() {
        fields += field.toString()
        field.setLength(0)
        afterQuote = false
    }

    fun finishRecord() {
        finishField()
        if (fields.any(String::isNotBlank)) records += CsvRecord(recordLine, fields.toList())
        fields.clear()
        recordLine = line + 1
    }

    fun consumeNewline() {
        if (text[index] == '\r' && index + 1 < text.length && text[index + 1] == '\n') index++
        line++
    }

    while (index < text.length) {
        val char = text[index]
        if (inQuotes) {
            when {
                char == '"' && index + 1 < text.length && text[index + 1] == '"' -> {
                    field.append('"')
                    index++
                }
                char == '"' -> {
                    inQuotes = false
                    afterQuote = true
                }
                char == '\r' || char == '\n' -> {
                    field.append('\n')
                    consumeNewline()
                }
                else -> field.append(char)
            }
        } else {
            when {
                char == ',' -> finishField()
                char == '\r' || char == '\n' -> {
                    finishRecord()
                    consumeNewline()
                    recordLine = line
                }
                char == '"' && field.isEmpty() && !afterQuote -> inQuotes = true
                afterQuote && char.isWhitespace() -> Unit
                char == '"' || afterQuote -> {
                    if (!malformed) issues += ContractCsvIssue(line, "file", "Malformed CSV quoting")
                    malformed = true
                    field.append(char)
                }
                else -> field.append(char)
            }
        }
        index++
    }
    if (inQuotes) issues += ContractCsvIssue(recordLine, "file", "Quoted value is not closed")
    if (field.isNotEmpty() || fields.isNotEmpty()) finishRecord()
    if (records.size > 5001) {
        issues += ContractCsvIssue(1, "file", "CSV cannot contain more than 5000 data rows")
        return CsvParseResult(records.take(5001), issues)
    }
    return CsvParseResult(records, issues)
}
