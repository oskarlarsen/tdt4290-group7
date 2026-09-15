package com.tdt4290group7.backend.pdf

import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import java.io.File

fun extractText(pdfFile: File): String {
    val document = Loader.loadPDF(pdfFile)
    document.use { doc ->
        return PDFTextStripper().getText(doc)
    }
}

fun main() {
    val resourceStream = object {}.javaClass.classLoader
        .getResourceAsStream("test-pdf/test-native-text.pdf")
        ?: error("Test PDF not found under resources/test-pdf/")

    val tempFile = File.createTempFile("test-native-text", ".pdf")
    tempFile.deleteOnExit()
    resourceStream.use { input -> tempFile.outputStream().use { output -> input.copyTo(output) } }

    val text = extractText(tempFile)
    println(text)
}