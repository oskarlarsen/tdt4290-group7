package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.pdf.extractTextWithOcr
import java.io.File

/**
 * Manual smoke test using a synthetic (fake) ISO 14001 certificate.
 * Supplier name, certificate number, and dates are fictional test data,
 * not from any real supplier.
 */
fun main() {
    val pdf = File("backend/src/main/resources/test-pdf/test-certificate-miljofyrtarn.pdf") //replace with actual pdf from data from ingrid to test
    val text = extractTextWithOcr(pdf)
    val parsed = CertificateParser.parse(text, pdf.name)

    val status = calculateStatus(parsed.expiryDate)

    println("Type: ${parsed.certificateType}")
    println("Issue date: ${parsed.issueDate}")
    println("Expiry date: ${parsed.expiryDate}")
    println("Missing data: ${parsed.missingData}")
    println("Status: $status")
}