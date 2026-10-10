package com.tdt4290group7.backend.certificates

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

object CertificateParser {

    private val DATE_FORMATS = listOf(
        DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("MMMM d yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("MMM d yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("dd-MM-yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ENGLISH),
    )

    private val EXPIRY_LABELS = listOf(
        "certificate expiry date", "date of expiry of certificate", "date of expiry",
        "expiry date", "expires", "valid until", "valid through", "valid thru",
        "valid till", "valid to", "validity date", "validity", "end date",
        "utløpsdato", "utløper", "gyldig til", "gyldighet til"
    )
    private val ISSUE_LABELS = listOf(
        "date of issue", "date of initial registration", "date of this certificate",
        "first issue date", "initial issue date", "first issued", "issue date", "issued", "certified on",
        "valid from",
        "utstedelsesdato", "utstedt", "dato for utstedelse", "gyldig fra"
    )

    private val MILJOFYRTARN_MARKER = "miljøfyrtårn"
    private val ISO14001_MARKER = "iso 14001"
    private val GRONT_PUNKT_MARKER = "grønt punkt norge"
    private val RETURA_MARKER = "retura"
    private val ECODRIVING_MARKER_1 = "kurs i økonomisk kjøring"
    private val ECODRIVING_MARKER_2 = "økonomisk kjøring"

    private val ALL_DATES_REGEX = Regex(
        "[A-Za-zæøåÆØÅ]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[.\\-/\\s][A-Za-zæøåÆØÅ]{3,9}[.\\-\\s]\\d{4}|\\d{1,2}[.\\-/]\\d{1,2}[.\\-/]\\d{4}|\\d{4}-\\d{2}-\\d{2}"
    )

    fun parse(rawText: String, sourceFile: String): ParsedCertificate {
        val lowerText = rawText.lowercase()
        val certificateType = detectCertificateType(lowerText)

        val dateRange = findDateRange(rawText)
        val issueDates = findDatesAfterLabels(rawText, lowerText, ISSUE_LABELS)
        var issueDate = issueDates.firstOrNull() ?: dateRange?.first
        var expiryDate = dateRange?.second ?: findDateAfterAnyLabel(
            rawText,
            lowerText,
            if (dateRange != null) EXPIRY_LABELS - "validity" else EXPIRY_LABELS
        )

        if (expiryDate == null && dateRange == null) {
            val otherDates = extractAllDates(rawText).filterNot { it in issueDates }
            if (issueDate != null && otherDates.isNotEmpty()) {
                expiryDate = otherDates.maxOrNull()
            } else if (otherDates.size >= 2) {
                issueDate = otherDates.minOrNull()
                expiryDate = otherDates.maxOrNull()
            } else if (otherDates.size == 1 && issueDate == null) {
                expiryDate = otherDates.first()
            }
        }

        return ParsedCertificate(
            certificateType = certificateType,
            issueDate = issueDate,
            expiryDate = expiryDate,
            sourceFile = sourceFile,
            missingData = expiryDate == null,
            additionalIssueDates = issueDates.drop(1)
        )
    }

    private fun findDateRange(text: String): Pair<LocalDate?, LocalDate?>? {
        val dateMatches = ALL_DATES_REGEX.findAll(text).toList()
        val rangeSeparator = Regex("\\s*(?:-|–|—|to|through|thru|until|till|til)\\s*", RegexOption.IGNORE_CASE)

        dateMatches.zipWithNext().forEach { (start, end) ->
            val separator = text.substring(start.range.last + 1, end.range.first)
            if (rangeSeparator.matches(separator)) {
                return parseDateToken(start.value.trim()) to parseDateToken(end.value.trim())
            }
        }
        return null
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

    private fun findDatesAfterLabels(
        originalText: String,
        lowerText: String,
        labels: List<String>
    ): List<LocalDate> {
        val allLabels = (ISSUE_LABELS + EXPIRY_LABELS).distinct()
        val labelMatches = findLabelMatches(lowerText, allLabels)
        val issueLabelMatches = findLabelMatches(lowerText, labels)

        val foundDates = mutableListOf<Pair<Int, LocalDate>>()
        issueLabelMatches.forEach { match ->
            val windowStart = match.range.last + 1
            val nextLabelStart = labelMatches
                .firstOrNull { it.range.first >= windowStart }
                ?.range
                ?.first
                ?: originalText.length
            val windowEnd = minOf(windowStart + 60, nextLabelStart, originalText.length)
            if (windowStart >= windowEnd) return@forEach

            val dateMatch = ALL_DATES_REGEX.find(originalText, windowStart)
            if (dateMatch != null && dateMatch.range.first < windowEnd) {
                parseDateToken(dateMatch.value.trim())?.let { date ->
                    foundDates.add(dateMatch.range.first to date)
                }
            }
        }

        return foundDates
            .sortedBy { it.first }
            .map { it.second }
            .distinct()
    }

    private fun findLabelMatches(text: String, labels: List<String>): List<MatchResult> {
        val matches = labels.flatMap { label ->
            Regex(Regex.escape(label)).findAll(text).toList()
        }.sortedWith(
            compareBy<MatchResult> { it.range.first }
                .thenByDescending { it.value.length }
        )

        val nonOverlappingMatches = mutableListOf<MatchResult>()
        matches.forEach { match ->
            if (nonOverlappingMatches.none {
                    match.range.first <= it.range.last && match.range.last >= it.range.first
                }
            ) {
                nonOverlappingMatches.add(match)
            }
        }
        return nonOverlappingMatches.sortedBy { it.range.first }
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
    val missingData: Boolean,
    val additionalIssueDates: List<LocalDate> = emptyList()
)