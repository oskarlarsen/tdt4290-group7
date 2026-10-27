package com.tdt4290group7.backend.pdf

import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import org.apache.pdfbox.rendering.PDFRenderer
import org.apache.pdfbox.rendering.ImageType
import java.io.File
import java.io.IOException
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

internal fun preprocessForOcr(img: BufferedImage): BufferedImage {
    val w = img.width
    val h = img.height
    val gray = BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY)
    val g = gray.createGraphics()
    g.drawImage(img, 0, 0, null)
    g.dispose()

    val raster = gray.raster
    val histogram = IntArray(256)
    var total = 0L
    for (y in 0 until h) {
        for (x in 0 until w) {
            val value = raster.getSample(x, y, 0)
            histogram[value]++
            total += value
        }
    }

    var backgroundWeight = 0L
    var backgroundTotal = 0L
    var bestVariance = -1.0
    var threshold = 0
    for (value in 0 until 255) {
        backgroundWeight += histogram[value]
        if (backgroundWeight == 0L) continue

        val foregroundWeight = raster.width.toLong() * raster.height - backgroundWeight
        if (foregroundWeight == 0L) break

        backgroundTotal += value.toLong() * histogram[value]
        val backgroundMean = backgroundTotal.toDouble() / backgroundWeight
        val foregroundMean = (total - backgroundTotal).toDouble() / foregroundWeight
        val meanDifference = backgroundMean - foregroundMean
        val variance = backgroundWeight.toDouble() * foregroundWeight * meanDifference * meanDifference
        if (variance > bestVariance) {
            bestVariance = variance
            threshold = value
        }
    }

    val contrastRange = 255 - threshold
    if (contrastRange == 0) return gray

    val enhanced = BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY)
    val enhancedRaster = enhanced.raster
    for (y in 0 until h) {
        for (x in 0 until w) {
            val value = raster.getSample(x, y, 0)
            val enhancedValue = if (value <= threshold) {
                0
            } else {
                ((value - threshold) * 255 / contrastRange).coerceIn(0, 255)
            }
            enhancedRaster.setSample(x, y, 0, enhancedValue)
        }
    }
    return enhanced
}

private fun runTesseract(imageFile: File, languages: String): String {
    val executable = com.tdt4290group7.backend.backendSetting("TESSERACT_PATH")
        ?.takeIf { it.isNotBlank() }
        ?: System.getenv("ProgramFiles")
            ?.let { File(File(it, "Tesseract-OCR"), "tesseract.exe") }
            ?.takeIf { it.isFile }
            ?.absolutePath
        ?: "tesseract"
    val process = try {
        ProcessBuilder(
            executable, imageFile.absolutePath, "stdout", "-l", languages, "--psm", "11"
        ).redirectErrorStream(true).start()
    } catch (e: IOException) {
        throw IllegalStateException(
            "Could not start Tesseract. Install Tesseract and add it to PATH, " +
                "or set TESSERACT_PATH to the full path of tesseract.exe.",
            e
        )
    }

    val output = process.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    val exitCode = process.waitFor()
    check(exitCode == 0) {
        "Tesseract exited with code $exitCode for ${imageFile.absolutePath}: $output"
    }
    return output
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
