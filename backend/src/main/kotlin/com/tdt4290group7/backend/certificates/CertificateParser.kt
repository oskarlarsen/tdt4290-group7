package com.tdt4290group7.backend.certificates

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

object CertificateParser {

    private val DATE_FORMATS = listOf(
        DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.ENGLISH),   // 04 July 2025
        DateTimeFormatter.ofPattern("dd-MM-yyyy", Locale.ENGLISH),     // 22-09-2022
        DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),     // 22.09.2022
        DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ENGLISH),     // 2025-07-04
    )

    private val EXPIRY_LABELS = listOf(
        "certificate expiry date", "date of expiry of certificate", "date of expiry",
        "expiry date", "expires", "valid until", "valid to", "end date",
        "utløpsdato", "utløper", "gyldig til", "gyldighet til"
    )
    private val ISSUE_LABELS = listOf(
        "date of issue", "date of initial registration", "date of this certificate",
        "issue date", "issued", "certified on", "valid from",
        "utstedelsesdato", "utstedt", "dato for utstedelse", "gyldig fra"
    )

    private val MILJOFYRTARN_MARKER = "miljøfyrtårn"
    private val ISO14001_MARKER = "iso 14001"
    private val GRONT_PUNKT_MARKER = "grønt punkt norge"
    private val RETURA_MARKER = "retura"
    private val ECODRIVING_MARKER_1 = "kurs i økonomisk kjøring"
    private val ECODRIVING_MARKER_2 = "økonomisk kjøring"

    private val ALL_DATES_REGEX = Regex(
        "\\d{1,2}[.\\-\\s][A-Za-zæøåÆØÅ]{3,9}[.\\-\\s]\\d{4}|\\d{1,2}[.\\-]\\d{1,2}[.\\-]\\d{4}|\\d{4}-\\d{2}-\\d{2}"
    )

    fun parse(rawText: String, sourceFile: String): ParsedCertificate {
        val lowerText = rawText.lowercase()
        val certificateType = detectCertificateType(lowerText)

        var issueDate = findDateAfterAnyLabel(rawText, lowerText, ISSUE_LABELS)
        var expiryDate = findDateAfterAnyLabel(rawText, lowerText, EXPIRY_LABELS)

        if (expiryDate == null) {
            val allDates = extractAllDates(rawText)
            if (allDates.size >= 2) {
                issueDate = issueDate ?: allDates.minOrNull()
                expiryDate = allDates.maxOrNull()
            } else if (allDates.size == 1 && issueDate == null) {
                expiryDate = allDates.first()
            }
        }

        return ParsedCertificate(
            certificateType = certificateType,
            issueDate = issueDate,
            expiryDate = expiryDate,
            sourceFile = sourceFile,
            missingData = expiryDate == null
        )
    }

    private fun detectCertificateType(lowerText: String): String = when {
        lowerText.contains(MILJOFYRTARN_MARKER) -> "Miljøfyrtårn"
        lowerText.contains(ISO14001_MARKER) -> "ISO 14001"
        lowerText.contains(GRONT_PUNKT_MARKER) -> "Grønt Punkt Norge"
        lowerText.contains(RETURA_MARKER) -> "Retura"
        lowerText.contains(ECODRIVING_MARKER_1) || lowerText.contains(ECODRIVING_MARKER_2) -> "Kurs i økonomisk kjøring"
        else -> "Unknown"
    }

    private fun findDateAfterAnyLabel(
        originalText: String,
        lowerText: String,
        labels: List<String>
    ): LocalDate? {
        for (label in labels) {
            val idx = lowerText.indexOf(label)
            if (idx == -1) continue
            val windowStart = idx + label.length
            val windowEnd = minOf(windowStart + 60, originalText.length)
            val window = originalText.substring(windowStart, windowEnd)
            val date = extractFirstDate(window)
            if (date != null) return date
        }
        return null
    }

    private fun extractFirstDate(window: String): LocalDate? =
        ALL_DATES_REGEX.find(window)?.value?.trim()?.let { parseDateToken(it) }

    private fun extractAllDates(text: String): List<LocalDate> =
        ALL_DATES_REGEX.findAll(text)
            .mapNotNull { parseDateToken(it.value.trim()) }
            .toList()

    private fun parseDateToken(token: String): LocalDate? {
        for (fmt in DATE_FORMATS) {
            try {
                return LocalDate.parse(token, fmt)
            } catch (_: DateTimeParseException) {
                // probar el siguiente formato
            }
        }
        return null
    }
}

data class ParsedCertificate(
    val certificateType: String,
    val issueDate: LocalDate?,
    val expiryDate: LocalDate?,
    val sourceFile: String,
    val missingData: Boolean
)