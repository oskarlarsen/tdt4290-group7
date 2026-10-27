package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.pdf.extractTextWithOcr
import com.tdt4290group7.backend.pdf.extractText
import java.io.File
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

private val certificateFixtures = listOf(
    "test-certificate-miljofyrtarn.pdf" to "Miljøfyrtårn",
    "test-certificate-iso14001.pdf" to "ISO 14001"
)

class CertificateParserTest {

    @Test
    fun keepsFirstAndAdditionalIssueDatesSeparate() {
        val parsed = CertificateParser.parse(
            """
                First issue date: 05 January 2018
                Date of issue: 04 January 2022
                Date of issue: 04 January 2024
                Certificate expiry date: 04 January 2025
            """.trimIndent(),
            "certificate.pdf"
        )

        assertEquals(LocalDate.of(2018, 1, 5), parsed.issueDate)
        assertEquals(
            listOf(LocalDate.of(2022, 1, 4), LocalDate.of(2024, 1, 4)),
            parsed.additionalIssueDates
        )
        assertEquals(LocalDate.of(2025, 1, 4), parsed.expiryDate)
    }

    @Test
    fun recognizesInitialRegistrationAsTheFirstIssueDate() {
        val parsed = CertificateParser.parse(
            """
                Date of initial registration: 05 January 2018
                Date of this certificate: 04 January 2024
                Certificate expiry date: 04 January 2025
            """.trimIndent(),
            "certificate.pdf"
        )

        assertEquals(LocalDate.of(2018, 1, 5), parsed.issueDate)
        assertEquals(listOf(LocalDate.of(2024, 1, 4)), parsed.additionalIssueDates)
    }

    @Test
    fun doesNotTreatAdditionalIssueDatesAsExpiryDates() {
        val parsed = CertificateParser.parse(
            """
                Date of issue: 05 January 2018
                Date of issue: 04 January 2024
            """.trimIndent(),
            "certificate.pdf"
        )

        assertEquals(LocalDate.of(2018, 1, 5), parsed.issueDate)
        assertEquals(listOf(LocalDate.of(2024, 1, 4)), parsed.additionalIssueDates)
        assertEquals(null, parsed.expiryDate)
        assertTrue(parsed.missingData)
    }

    @Test
    fun recognizesExpiryLabelsAndSlashSeparatedDates() {
        listOf("Valid to", "Valid thru", "Valid through", "Validity").forEach { label ->
            val parsed = CertificateParser.parse(
                "Date of issue: 05/01/2024\n$label: 05/01/2025",
                "certificate.pdf"
            )

            assertEquals(LocalDate.of(2025, 1, 5), parsed.expiryDate, label)
            assertFalse(parsed.missingData, label)
        }
    }

    @Test
    fun extractsBothDatesFromDotSeparatedValidityRange() {
        val parsed = CertificateParser.parse(
            "19.08.2015-19.08.2024",
            "certificate.pdf"
        )

        assertEquals(LocalDate.of(2015, 8, 19), parsed.issueDate)
        assertEquals(LocalDate.of(2024, 8, 19), parsed.expiryDate)
        assertFalse(parsed.missingData)
    }

    @Test
    fun recognizesDateRangesWithoutRelyingOnAValidityLabel() {
        val cases = listOf(
            "Period: 01/05/2020 – 01/05/2025" to
                (LocalDate.of(2020, 5, 1) to LocalDate.of(2025, 5, 1)),
            "Valid from May 1, 2020 to May 1, 2025" to
                (LocalDate.of(2020, 5, 1) to LocalDate.of(2025, 5, 1)),
            "01-05-2020 through 01-05-2025" to
                (LocalDate.of(2020, 5, 1) to LocalDate.of(2025, 5, 1))
        )

        cases.forEach { (text, expectedDates) ->
            val parsed = CertificateParser.parse(text, "certificate.pdf")

            assertEquals(expectedDates.first, parsed.issueDate, text)
            assertEquals(expectedDates.second, parsed.expiryDate, text)
            assertFalse(parsed.missingData, text)
        }
    }

    @Test
    fun parsesValidityLabelRangeAsIssueAndExpiryDates() {
        val parsed = CertificateParser.parse(
            "VALIDITY: 19.08.2015 - 19.08.2024",
            "certificate.pdf"
        )

        assertEquals(LocalDate.of(2015, 8, 19), parsed.issueDate)
        assertEquals(LocalDate.of(2024, 8, 19), parsed.expiryDate)
        assertFalse(parsed.missingData)
    }

    @Test
    fun ignoresZeroPlaceholderDatesInValidityRange() {
        val parsed = CertificateParser.parse(
            "VALIDITY: 0000.00.00 - 0000.00.00",
            "certificate.pdf"
        )

        assertEquals(null, parsed.issueDate)
        assertEquals(null, parsed.expiryDate)
        assertTrue(parsed.missingData)
    }

    @Test
    fun recognizesEnglishMonthFirstDatesInExtractedText() {
        val parsed = CertificateParser.parse(
            """
                Valid thru:
                June 30, 2022
                Validity:
                June 22, 2015 - June 30, 2022
            """.trimIndent(),
            "certificate.pdf"
        )

        assertEquals(LocalDate.of(2022, 6, 30), parsed.expiryDate)
        assertFalse(parsed.missingData)
    }

    @Test
    fun identifiesEverySupportedCertificateType() {
        val certificates = listOf(
            "miljøfyrtårn" to "Miljøfyrtårn",
            "ISO 14001" to "ISO 14001",
            "Grønt Punkt Norge" to "Grønt Punkt Norge",
            "Retura" to "Retura",
            "Kurs i økonomisk kjøring" to "Kurs i økonomisk kjøring"
        )

        certificates.forEach { (marker, expectedType) ->
            val parsed = CertificateParser.parse(
                "$marker\nDate of issue: 05 January 2024\nExpiry date: 05 January 2025",
                "certificate.pdf"
            )
            assertEquals(expectedType, parsed.certificateType, marker)
            assertEquals(LocalDate.of(2024, 1, 5), parsed.issueDate, marker)
        }
    }

    @Test
    fun parsesReproducibleRandomSyntheticSamplesAcrossSupportedFormatsAndStatuses() {
        val today = LocalDate.of(2026, 10, 27)
        val samples = createSyntheticCertificateSamples(count = 60, seed = 4290L, today = today)

        samples.forEach { sample ->
            val parsed = CertificateParser.parse(sample.text, sample.sourceFile)
            assertEquals(sample.expectedType, parsed.certificateType, sample.sourceFile)
            assertEquals(sample.issueDate, parsed.issueDate, sample.sourceFile)
            assertEquals(sample.expiryDate, parsed.expiryDate, sample.sourceFile)
            assertEquals(sample.expiryDate == null, parsed.missingData, sample.sourceFile)
        }

        assertEquals(
            setOf("dd MMMM yyyy", "MMMM d, yyyy", "dd-MM-yyyy", "dd.MM.yyyy", "dd/MM/yyyy", "yyyy-MM-dd"),
            samples.map { it.dateFormat }.toSet(),
        )
        assertEquals(syntheticCertificateTypesForTesting, samples.map { it.expectedType }.toSet())
        assertEquals(
            setOf(
                CertificateStatus.EXPIRED,
                CertificateStatus.EXPIRES_30D,
                CertificateStatus.EXPIRES_90D,
                CertificateStatus.EXPIRES_180D,
                CertificateStatus.VALID,
                CertificateStatus.MISSING_DOCUMENTATION,
            ),
            samples.map { calculateStatus(it.expiryDate, today) }.toSet(),
        )
        val exactBoundaryStatuses = samples.mapNotNull { sample ->
            sample.expiryDate?.let { expiry ->
                java.time.temporal.ChronoUnit.DAYS.between(today, expiry) to calculateStatus(expiry, today)
            }
        }.toMap()
        assertEquals(CertificateStatus.EXPIRED, exactBoundaryStatuses[-1L])
        assertEquals(CertificateStatus.EXPIRES_30D, exactBoundaryStatuses[0L])
        assertEquals(CertificateStatus.EXPIRES_30D, exactBoundaryStatuses[30L])
        assertEquals(CertificateStatus.EXPIRES_90D, exactBoundaryStatuses[31L])
        assertEquals(CertificateStatus.EXPIRES_90D, exactBoundaryStatuses[90L])
        assertEquals(CertificateStatus.EXPIRES_180D, exactBoundaryStatuses[91L])
        assertEquals(CertificateStatus.EXPIRES_180D, exactBoundaryStatuses[180L])
        assertEquals(CertificateStatus.VALID, exactBoundaryStatuses[181L])
        assertTrue(samples.any {
            it.expiryDate == null && calculateStatus(it.expiryDate, today) == CertificateStatus.MISSING_DOCUMENTATION
        })
        assertTrue(samples.any { it.usesValidityRange })
    }

    @Test
    fun generatedPdfSamplesSurvivePdfTextExtractionAndParsing() {
        val today = LocalDate.of(2026, 10, 27)
        val samples = createSyntheticCertificateSamples(count = 12, seed = 21L, today = today)
        val temporaryDirectory = java.nio.file.Files.createTempDirectory("synthetic-certificates-")

        try {
            samples.forEach { sample ->
                val pdf = temporaryDirectory.resolve(sample.sourceFile)
                writeSyntheticCertificatePdf(sample, pdf)
                val extracted = extractText(pdf.toFile())
                val parsed = CertificateParser.parse(extracted, sample.sourceFile)

                assertTrue(extracted.contains("NOT A VALID CERTIFICATE"), sample.sourceFile)
                assertEquals(sample.expectedType, parsed.certificateType, sample.sourceFile)
                assertEquals(sample.issueDate, parsed.issueDate, sample.sourceFile)
                assertEquals(sample.expiryDate, parsed.expiryDate, sample.sourceFile)
            }
        } finally {
            temporaryDirectory.toFile().deleteRecursively()
        }
    }

    @Test
    fun extractsAvailableCertificatePdfFixtures() {
        certificateFixtures.forEach { (fileName, expectedType) ->
            val extractedText = extractFixtureText(fileName)
            assertFalse(extractedText.isBlank(), "No text extracted from $fileName")
            assertEquals(expectedType, CertificateParser.parse(extractedText, fileName).certificateType)
        }
    }
}

private val syntheticCertificateTypesForTesting = setOf(
    "Miljøfyrtårn",
    "ISO 14001",
    "Grønt Punkt Norge",
    "Retura",
    "Kurs i økonomisk kjøring",
    "Unknown",
)

private fun extractFixtureText(fileName: String): String {
    val resource = object {}.javaClass.classLoader.getResourceAsStream("test-pdf/$fileName")
    assertNotNull(resource, "Missing test PDF: $fileName")

    val pdf = File.createTempFile("certificate-test-", ".pdf")
    try {
        resource.use { input -> pdf.outputStream().use(input::copyTo) }
        return extractTextWithOcr(pdf)
    } finally {
        pdf.delete()
    }
}
