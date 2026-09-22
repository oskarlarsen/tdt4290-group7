package com.tdt4290group7.backend.pdf

import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import org.apache.pdfbox.rendering.PDFRenderer
import org.apache.pdfbox.rendering.ImageType
import java.io.File
import javax.imageio.ImageIO
import java.awt.image.BufferedImage

fun extractText(pdfFile: File): String {
    val document = Loader.loadPDF(pdfFile)
    document.use { doc ->
        return PDFTextStripper().getText(doc)
    }
}

/**
 * Extract text from a PDF using native PDFBox extraction per page and fall back to
 * OCR (tesseract CLI) for pages where native extraction yields little or no text.
 *
 * - languages: tesseract language codes (e.g. "eng+nor")
 * - dpi: rendering DPI for OCR (300 is a good default)
 */
fun extractTextWithOcr(pdfFile: File, languages: String = "eng+nor", dpi: Int = 300): String {
    val doc = Loader.loadPDF(pdfFile)
    val pageTexts = mutableListOf<String>()

    doc.use { document ->
        val stripper = PDFTextStripper()
        // try to keep spatial order
        stripper.sortByPosition = true

        val renderer = PDFRenderer(document)
        val pageCount = document.numberOfPages

        for (pageIndex in 1..pageCount) {
            stripper.startPage = pageIndex
            stripper.endPage = pageIndex
            val nativeText = stripper.getText(document).trim()

            if (nativeText.length >= 30) {
                pageTexts.add(nativeText)
            } else {
                // Render page to image and run OCR
                val image: BufferedImage = renderer.renderImageWithDPI(pageIndex - 1, dpi.toFloat(), ImageType.RGB)
                val preprocessed = preprocessForOcr(image)

                val tempImage = File.createTempFile("pdf_page_${pageIndex}", ".png")
                tempImage.deleteOnExit()
                ImageIO.write(preprocessed, "png", tempImage)

                val ocrText = runTesseract(tempImage, languages)
                pageTexts.add(ocrText.trim())

                // cleanup
                try { tempImage.delete() } catch (_: Exception) {}
            }
        }
    }

    // join pages with an explicit separator so downstream parser can use page boundaries
    return pageTexts.joinToString(separator = "\n\n--- PAGE BREAK ---\n\n")
}

private fun preprocessForOcr(img: BufferedImage): BufferedImage {
    // Simple preprocessing: convert to grayscale. More advanced steps (deskew, denoise)
    // can be added if needed (OpenCV/ImageMagick).
    val w = img.width
    val h = img.height
    val gray = BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY)
    val g = gray.createGraphics()
    g.drawImage(img, 0, 0, null)
    g.dispose()
    return gray
}

private fun runTesseract(imageFile: File, languages: String): String {
    try {
        val pb = ProcessBuilder("tesseract", imageFile.absolutePath, "stdout", "-l", languages, "--psm", "1")
        pb.redirectErrorStream(true)
        val proc = pb.start()
        val output = proc.inputStream.readBytes().toString(Charsets.UTF_8)
        val exit = proc.waitFor()
        if (exit != 0) {
            System.err.println("Tesseract exited with code $exit for ${imageFile.absolutePath}")
        }
        return output
    } catch (e: Exception) {
        System.err.println("Failed to run tesseract: ${e.message}")
        return ""
    }
}

fun main_old() {
    val resourceStream = object {}.javaClass.classLoader
        .getResourceAsStream("test-pdf/test-native-text.pdf")
        ?: error("Test PDF not found under resources/test-pdf/")

    val tempFile = File.createTempFile("test-native-text", ".pdf")
    tempFile.deleteOnExit()
    resourceStream.use { input -> tempFile.outputStream().use { output -> input.copyTo(output) } }

    val text = extractText(tempFile)
    println(text)
}

fun main() {
    val resourceStream = object {}.javaClass.classLoader
        .getResourceAsStream("test-pdf/test-native-text.pdf")
        ?: error("Test PDF not found under resources/test-pdf/")

    val tempFile = File.createTempFile("test-native-text", ".pdf")
    tempFile.deleteOnExit()
    resourceStream.use { input -> tempFile.outputStream().use { output -> input.copyTo(output) } }

    val text = extractTextWithOcr(tempFile, languages = "eng+nor", dpi = 300)
    println(text)
}