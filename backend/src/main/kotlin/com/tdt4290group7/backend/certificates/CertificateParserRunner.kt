package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.pdf.extractTextWithOcr
import java.io.File

private const val PDF_PATH = """"""
/**
 * To run this parser from the IDE, set PDF_PATH above to the PDF's absolute path,
 * then run this main (CertificateParserRunnerKt), not ApplicationKt.
 *
 * Tesseract must be installed and available on PATH. If it is not, set
 * TESSERACT_PATH to the full path of tesseract.exe in the IDE run configuration.
 *
 * Alternatively, from the backend directory run: .\gradlew.bat runCertificateParser
 */
fun main() {
    val pdf = File(PDF_PATH)
    require(pdf.isFile) {
        "PDF file does not exist: ${pdf.absolutePath}. Set PDF_PATH in CertificateParserRunner.kt to your PDF's absolute path."
    }

    val extractedText = extractTextWithOcr(pdf, languages = "nor+eng", dpi = 400)
    val outputFile = File("extracted.txt")
    outputFile.writeText(extractedText, Charsets.UTF_8)
    println("Texto guardado en: ${outputFile.absolutePath}")
    val parsed = CertificateParser.parse(extractedText, pdf.name)

    println("===== ${pdf.name}: extracted text =====")
    println(extractedText)
    println("===== Parsed result =====")
    println("Type: ${parsed.certificateType}")
    println("First issue date: ${parsed.issueDate}")
    println("Additional issue dates: ${parsed.additionalIssueDates}")
    println("Expiry date: ${parsed.expiryDate}")
    println("Missing data: ${parsed.missingData}")
}
