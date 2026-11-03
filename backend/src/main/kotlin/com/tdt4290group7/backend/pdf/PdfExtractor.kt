package com.tdt4290group7.backend.pdf

import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import org.apache.pdfbox.rendering.PDFRenderer
import org.apache.pdfbox.rendering.ImageType
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO
import java.awt.image.BufferedImage

private const val TESSERACT_MAX_CONCURRENT_PROCESSES = 2
private const val TESSERACT_QUEUE_TIMEOUT_SECONDS = 30L
private const val TESSERACT_PROCESS_TIMEOUT_SECONDS = 60L
private val tesseractSlots = Semaphore(TESSERACT_MAX_CONCURRENT_PROCESSES, true)

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
                pageTexts.add(
                    withTesseractSlot {
                        val image: BufferedImage =
                            renderer.renderImageWithDPI(pageIndex - 1, dpi.toFloat(), ImageType.RGB)
                        val preprocessed = preprocessForOcr(image)
                        val tempImage = Files.createTempFile("pdf_page_${pageIndex}_", ".png")
                        try {
                            check(ImageIO.write(preprocessed, "png", tempImage.toFile())) {
                                "PNG image writer is unavailable"
                            }
                            runTesseract(tempImage.toFile(), languages).trim()
                        } finally {
                            Files.deleteIfExists(tempImage)
                        }
                    },
                )
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

private fun <T> withTesseractSlot(action: () -> T): T {
    val acquired = try {
        tesseractSlots.tryAcquire(TESSERACT_QUEUE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (cause: InterruptedException) {
        Thread.currentThread().interrupt()
        throw IllegalStateException("Interrupted while waiting for an OCR slot", cause)
    }
    check(acquired) { "OCR capacity is temporarily full; try again shortly" }

    try {
        return action()
    } finally {
        tesseractSlots.release()
    }
}

private fun runTesseract(imageFile: File, languages: String): String {
    val executable = com.tdt4290group7.backend.backendSetting("TESSERACT_PATH")
        ?.takeIf { it.isNotBlank() }
        ?: System.getenv("ProgramFiles")
            ?.let { File(File(it, "Tesseract-OCR"), "tesseract.exe") }
            ?.takeIf { it.isFile }
            ?.absolutePath
        ?: "tesseract"
    val outputFile = Files.createTempFile("tesseract-output-", ".txt")
    try {
        val process = try {
            ProcessBuilder(
                executable, imageFile.absolutePath, "stdout", "-l", languages, "--psm", "11",
            ).redirectErrorStream(true).redirectOutput(outputFile.toFile()).start()
        } catch (cause: IOException) {
            throw IllegalStateException(
                "Could not start Tesseract. Install it and add it to PATH, or set TESSERACT_PATH.",
                cause,
            )
        }

        val completed = try {
            process.waitFor(TESSERACT_PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (cause: InterruptedException) {
            terminateTesseract(process)
            Thread.currentThread().interrupt()
            throw IllegalStateException("Interrupted while waiting for Tesseract", cause)
        }
        if (!completed) {
            terminateTesseract(process)
            throw IllegalStateException(
                "Tesseract exceeded its $TESSERACT_PROCESS_TIMEOUT_SECONDS-second timeout",
            )
        }

        val output = Files.readString(outputFile, Charsets.UTF_8)
        check(process.exitValue() == 0) {
            "Tesseract exited with code ${process.exitValue()} for ${imageFile.absolutePath}: $output"
        }
        return output
    } finally {
        Files.deleteIfExists(outputFile)
    }
}

private fun terminateTesseract(process: Process) {
    process.destroyForcibly()
    var interrupted = false
    while (process.isAlive) {
        try {
            process.waitFor()
        } catch (_: InterruptedException) {
            interrupted = true
        }
    }
    if (interrupted) Thread.currentThread().interrupt()
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
