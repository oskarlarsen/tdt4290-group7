package com.tdt4290group7.backend.pdf

import java.awt.image.BufferedImage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PdfExtractorTest {

    @Test
    fun boostsContrastForLightGrayText() {
        val image = BufferedImage(100, 100, BufferedImage.TYPE_BYTE_GRAY)
        val raster = image.raster
        for (y in 0 until image.height) {
            for (x in 0 until image.width) {
                raster.setSample(x, y, 0, 255)
            }
        }
        for (y in 20 until 80) {
            for (x in 20 until 80) {
                raster.setSample(x, y, 0, 210)
            }
        }
        for (y in 40 until 60) {
            for (x in 40 until 60) {
                raster.setSample(x, y, 0, 230)
            }
        }

        val enhanced = preprocessForOcr(image).raster

        assertEquals(255, enhanced.getSample(0, 0, 0))
        assertEquals(0, enhanced.getSample(25, 25, 0))
        assertTrue(enhanced.getSample(45, 45, 0) < 230)
    }

    @Test
    fun keepsNormalPagesAtRequestedDpi() {
        assertEquals(300f, ocrDpiFor(595f, 842f, 300f)) // A4
    }

    @Test
    fun lowersDpiForLargePagesAndRejectsHugeOnes() {
        val fitted = ocrDpiFor(72f * 30, 72f * 30, 300f)!! // 30x30 inch page
        assertTrue(fitted < 300f && fitted >= 100f)
        assertEquals(null, ocrDpiFor(72f * 100, 72f * 100, 300f)) // 100x100 inch page
    }
}
