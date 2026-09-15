package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.pdf.extractText
import java.io.File

/**
 * Manual smoke test using a synthetic (fake) ISO 14001 certificate.
 * Supplier name, certificate number, and dates are fictional test data,
 * not from any real supplier.
 */
fun main() {
    val pdf = File("backend/src/main/resources/test-pdf/test-certificate-iso14001.pdf")
    val text = extractText(pdf)
    val parsed = CertificateParser.parse(text, pdf.name)
    println("Type: ${parsed.certificateType}")
    println("Issue date: ${parsed.issueDate}")
    println("Expiry date: ${parsed.expiryDate}")
    println("Missing data: ${parsed.missingData}")
}