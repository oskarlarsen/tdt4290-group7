package com.tdt4290group7.backend.pdf

import org.apache.pdfbox.Loader
import org.apache.pdfbox.rendering.PDFRenderer
import org.apache.pdfbox.text.PDFTextStripper
import net.sourceforge.tess4j.Tesseract
import java.io.File

fun extractText(pdfFile: File, tessDataPath: String): String {
    val document = Loader.loadPDF(pdfFile)
    document.use { doc ->
        val nativeText = PDFTextStripper().getText(doc)

        if (nativeText.trim().length > 50) {
            return nativeText
        }

        val renderer = PDFRenderer(doc)
        val tesseract = Tesseract().apply {
            setDatapath(tessDataPath)
            setLanguage("eng")
        }

        val sb = StringBuilder()
        for (page in 0 until doc.numberOfPages) {
            val image = renderer.renderImageWithDPI(page, 300f)
            val ocrText = tesseract.doOCR(image)
            sb.append(ocrText).append("\n")
        }
        return sb.toString()
    }
}

fun main() {
    val pdf = File("backend/src/main/resources/test-pdf/test-native-text.pdf")
    val tessDataPath = "src/main/resources/tessdata"
    val text = extractText(pdf, tessDataPath)
    println(text)
}