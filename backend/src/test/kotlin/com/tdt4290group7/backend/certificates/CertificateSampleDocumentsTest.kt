package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.pdf.extractTextWithOcr
import java.io.File
import java.nio.file.Path
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

class CertificateSampleDocumentsTest {
    @Test
    fun samplePdfsExtractTheExpectedTypesDatesAndStatuses() {
        val today = LocalDate.of(2026, 10, 30)
        val samples = listOf(
            Sample("01-iso-14001-valid.pdf", "ISO 14001", LocalDate.of(2028, 10, 30), CertificateStatus.VALID),
            Sample("02-miljofyrtarn-critical.pdf", "Miljøfyrtårn", LocalDate.of(2026, 11, 15), CertificateStatus.EXPIRES_30D),
            Sample("03-gront-punkt-expiring-60d.pdf", "Grønt Punkt Norge", LocalDate.of(2026, 12, 29), CertificateStatus.EXPIRES_90D),
            Sample("04-retura-expiring-150d.pdf", "Retura", LocalDate.of(2027, 3, 29), CertificateStatus.EXPIRES_180D),
            Sample("05-eco-driving-expired.pdf", "Kurs i økonomisk kjøring", LocalDate.of(2026, 10, 20), CertificateStatus.EXPIRED),
            Sample("06-unrecognized-missing-expiry.pdf", "Unknown", null, CertificateStatus.MISSING_DOCUMENTATION),
        )

        samples.forEach { sample ->
            val file = Path.of("..", "sample-certificates", sample.fileName).toAbsolutePath().normalize().toFile()
            val parsed = CertificateParser.parse(extractTextWithOcr(file), sample.fileName)

            assertEquals(sample.expectedType, parsed.certificateType, sample.fileName)
            assertEquals(sample.expectedExpiry, parsed.expiryDate, sample.fileName)
            assertEquals(sample.expectedStatus, calculateStatus(parsed.expiryDate, today), sample.fileName)
        }
    }

    private data class Sample(
        val fileName: String,
        val expectedType: String,
        val expectedExpiry: LocalDate?,
        val expectedStatus: CertificateStatus,
    )
}
