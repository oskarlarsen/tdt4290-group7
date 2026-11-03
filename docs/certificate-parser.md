# Certificate extraction and parsing

The backend includes a standalone tool for extracting certificate text and parsing certificate type, issue dates, expiry date and missing fields. It is separate from the placeholder certificate page and has no upload API.

## Setup

Complete the [local prerequisites](../README.md#1-prerequisites). For scanned PDFs, also install Tesseract with **English (`eng`) and Norwegian (`nor`) language data**. Text-based pages use PDFBox; pages with little text fall back to OCR.

Check Tesseract is available:

```sh
tesseract --version
tesseract --list-langs
```

If the executable is not on `PATH`, set `TESSERACT_PATH` in root `.env` to its full path. The Docker images do not include Tesseract or the language data.

## Run

1. Open [`CertificateParserRunner.kt`](../backend/src/main/kotlin/com/tdt4290group7/backend/certificates/CertificateParserRunner.kt) and set `PDF_PATH` to your PDF's absolute path.
2. From `backend/`, run the parser:

PowerShell:

```powershell
.\gradlew.bat runCertificateParser
```

macOS:

```sh
./gradlew runCertificateParser
```

The command prints extracted text and parsed fields, and writes `extracted.txt` in the working directory. The runner currently requires editing `PDF_PATH`; it does not accept a filename argument. Keep that local path out of shared changes.
