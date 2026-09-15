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

    private val ISO_EXPIRY_LABELS = listOf(
        "certificate expiry date", "date of expiry", "date of expiry of certificate"
    )
    private val ISO_ISSUE_LABELS = listOf(
        "date of issue", "date of initial registration", "date of this certificate"
    )
    private val MILJOFYRTARN_MARKER = "miljøfyrtårn"
    private val ISO14001_MARKER = "iso 14001"

    fun parse(rawText: String, sourceFile: String): ParsedCertificate {
        val text = rawText.lowercase()
        val certificateType = detectCertificateType(text)

        val issueDate = findDateAfterAnyLabel(rawText, text, ISO_ISSUE_LABELS)
        var expiryDate = findDateAfterAnyLabel(rawText, text, ISO_EXPIRY_LABELS)

        if (expiryDate == null && certificateType == "Miljøfyrtårn" && issueDate != null) {
            expiryDate = issueDate.plusYears(3)
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

    private val DATE_REGEX = Regex(
        "\\d{1,2}[.\\-\\s][A-Za-zæøåÆØÅ]{3,9}[.\\-\\s]\\d{4}|\\d{1,2}[.\\-]\\d{1,2}[.\\-]\\d{4}|\\d{4}-\\d{2}-\\d{2}"
    )

    private fun extractFirstDate(window: String): LocalDate? {
        val match = DATE_REGEX.find(window) ?: return null
        for (fmt in DATE_FORMATS) {
            try {
                return LocalDate.parse(match.value.trim(), fmt)
            } catch (_: DateTimeParseException) {
                // try next format
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