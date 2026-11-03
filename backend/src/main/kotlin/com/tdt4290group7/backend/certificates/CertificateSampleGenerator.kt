package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.pdf.extractText
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.random.Random
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts

private const val OSLO_TIME_ZONE = "Europe/Oslo"
private val syntheticDateFormats = listOf(
    "dd MMMM yyyy" to DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.ENGLISH),
    "MMMM d, yyyy" to DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH),
    "dd-MM-yyyy" to DateTimeFormatter.ofPattern("dd-MM-yyyy", Locale.ENGLISH),
    "dd.MM.yyyy" to DateTimeFormatter.ofPattern("dd.MM.yyyy", Locale.ENGLISH),
    "dd/MM/yyyy" to DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ENGLISH),
    "yyyy-MM-dd" to DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.ENGLISH),
)

private val syntheticCertificateTypes = listOf(
    "Miljøfyrtårn" to "Miljøfyrtårn",
    "ISO 14001" to "ISO 14001",
    "Grønt Punkt Norge" to "Grønt Punkt Norge",
    "Retura" to "Retura",
    "Kurs i økonomisk kjøring" to "Kurs i økonomisk kjøring",
    "Environmental quality certificate" to "Unknown",
)

private val syntheticDateLabels = listOf(
    "Date of issue" to "Certificate expiry date",
    "Utstedelsesdato" to "Utløpsdato",
    "Gyldig fra" to "Gyldig til",
    "Certified on" to "Valid until",
    "First issued" to "Valid through",
)

private val syntheticExpiryOffsets = listOf(-1L, 0L, 30L, 31L, 90L, 91L, 180L, 181L, null)

internal data class SyntheticCertificateSample(
    val number: Int,
    val supplierName: String,
    val sourceFile: String,
    val expectedType: String,
    val issueDate: LocalDate?,
    val expiryDate: LocalDate?,
    val dateFormat: String,
    val usesValidityRange: Boolean,
    val text: String,
)

internal fun createSyntheticCertificateSamples(
    count: Int,
    seed: Long,
    today: LocalDate = LocalDate.now(ZoneId.of(OSLO_TIME_ZONE)),
): List<SyntheticCertificateSample> {
    require(count in 1..60) { "Sample count must be between 1 and 60" }

    val random = Random(seed)
    val dateFormats = syntheticDateFormats.shuffled(random)
    val certificateTypes = syntheticCertificateTypes.shuffled(random)
    val dateLabels = syntheticDateLabels.shuffled(random)
    val expiryOffsets = syntheticExpiryOffsets.shuffled(random)
    val layouts = listOf(false, true).shuffled(random)

    return (0 until count).map { index ->
        val number = index + 1
        val (formatName, formatter) = dateFormats[index % dateFormats.size]
        val (typeMarker, expectedType) = certificateTypes[index % certificateTypes.size]
        val (issueLabel, expiryLabel) = dateLabels[index % dateLabels.size]
        val usesValidityRange = layouts[index % layouts.size]
        val expiryOffset = expiryOffsets[index % expiryOffsets.size]
        val expiryDate = expiryOffset?.let(today::plusDays)
        val issueDate = expiryDate?.minusYears(random.nextLong(1, 6))
            ?: today.minusYears(random.nextLong(1, 6))
        val includesIssueDate = random.nextInt(5) != 0
        val supplierName = "Sample Supplier %03d AS".format(number)
        val sourceFile = "synthetic-certificate-%03d.pdf".format(number)
        val issueText = issueDate.format(formatter)
        val expiryText = expiryDate?.format(formatter)
        val text = buildList {
            add("Supplier: $supplierName")
            add(typeMarker)
            if (usesValidityRange && expiryText != null && includesIssueDate) {
                add("Validity: $issueText – $expiryText")
            } else {
                if (includesIssueDate) add("$issueLabel: $issueText")
                if (expiryText != null) add("$expiryLabel: $expiryText")
            }
        }.joinToString("\n")

        SyntheticCertificateSample(
            number = number,
            supplierName = supplierName,
            sourceFile = sourceFile,
            expectedType = expectedType,
            issueDate = issueDate.takeIf { includesIssueDate },
            expiryDate = expiryDate,
            dateFormat = formatName,
            usesValidityRange = usesValidityRange && expiryText != null && includesIssueDate,
            text = text,
        )
    }
}

internal fun writeSyntheticCertificatePdf(sample: SyntheticCertificateSample, output: Path) {
    PDDocument().use { document ->
        document.addPage(PDPage())
        PDPageContentStream(document, document.getPage(0)).use { content ->
            content.beginText()
            content.setFont(PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 16f)
            content.newLineAtOffset(48f, 744f)
            content.showText("SYNTHETIC TEST FILE - NOT A VALID CERTIFICATE")
            content.newLineAtOffset(0f, -32f)
            content.setFont(PDType1Font(Standard14Fonts.FontName.HELVETICA), 12f)
            content.showText("Do not use as compliance evidence")
            content.newLineAtOffset(0f, -42f)
            sample.text.lineSequence().forEach { line ->
                content.showText(line)
                content.newLineAtOffset(0f, -24f)
            }
            content.endText()
        }
        val pdf = ByteArrayOutputStream()
        document.save(pdf)
        Files.write(output, pdf.toByteArray())
    }
}

fun main(args: Array<String>) {
    require(args.size <= 2) { "Usage: runCertificateGenerator [count] [seed]" }
    val count = args.getOrNull(0)?.toIntOrNull() ?: 12
    val seed = args.getOrNull(1)?.toLongOrNull() ?: Random.Default.nextLong()
    val outputDirectory = Path.of("build", "generated-certificate-samples", "seed-$seed")
    Files.createDirectories(outputDirectory)

    val today = LocalDate.now(ZoneId.of(OSLO_TIME_ZONE))
    val samples = createSyntheticCertificateSamples(count, seed, today)
    println("Generating $count synthetic, text-based PDFs with seed $seed")
    println("Output directory: ${outputDirectory.toAbsolutePath()}")

    samples.forEach { sample ->
        val output = outputDirectory.resolve(sample.sourceFile)
        writeSyntheticCertificatePdf(sample, output)

        val extractedText = extractText(output.toFile())
        val parsed = CertificateParser.parse(extractedText, sample.sourceFile)
        check(parsed.certificateType == sample.expectedType) {
            "${sample.sourceFile}: expected type '${sample.expectedType}', got '${parsed.certificateType}'"
        }
        check(parsed.issueDate == sample.issueDate) {
            "${sample.sourceFile}: expected issue date '${sample.issueDate}', got '${parsed.issueDate}'"
        }
        check(parsed.expiryDate == sample.expiryDate) {
            "${sample.sourceFile}: expected expiry date '${sample.expiryDate}', got '${parsed.expiryDate}'"
        }

        val status = calculateStatus(parsed.expiryDate, today)
        println(
            "PASS ${sample.sourceFile}: ${parsed.certificateType}, " +
                "issue=${parsed.issueDate ?: "missing"}, expiry=${parsed.expiryDate ?: "missing"}, status=$status",
        )
    }
}
