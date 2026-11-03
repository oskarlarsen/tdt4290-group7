# Supplier onboarding and contract CSV tutorial

The onboarding flow saves suppliers and their service contracts in the backend's SQLite fleet database. It previews CSV data before import, rejects a whole import if any issue is found, and links certificates to an imported contract. These service contracts are different from vehicle fleet agreements.

## Start the application

From the repository root, configure `.env` as described in the [local setup](../README.md#run-locally), including `JWT_SECRET`, `SEED_ADMIN_PASSWORD` and `SEED_SUPPLIER_PASSWORD`.

In one PowerShell terminal:

```powershell
Set-Location backend
.\gradlew.bat run
```

In a second terminal:

```powershell
Set-Location frontend
npm run dev
```

Open `http://localhost:5173` and sign in with the admin account (`advisor.hansen@kommune.no` and the configured `SEED_ADMIN_PASSWORD`). Use `localhost` for both frontend and API so the session cookie works.

## Create a supplier and import contracts

1. Open **Suppliers → Add Supplier**, or choose **Supplier onboarding** in the admin sidebar.
2. Enter the supplier name and its nine-digit organization number, then choose **Create supplier**. Existing suppliers can instead be selected in the next section.
3. Choose the supplier, then download the CSV template. It contains only the required header row.
4. Fill the CSV with one service contract per row. The columns and order must be exactly:

   ```csv
   contractName,contractReference,startDate,endDate
   "Municipal waste, phase 2",WS-2026,2026-01-01,2026-12-31
   ```

   Dates must be real calendar dates in `YYYY-MM-DD` format. A reference must be unique for that supplier; contract names can contain commas when quoted. The file can contain up to 5,000 rows and 2 MB.

5. Select the CSV and press **Validate CSV**. Review the preview and resolve every listed row/field error before proceeding. No contract is saved during preview.
6. Press **Import contracts** once the preview reports that all rows are ready. The backend checks the CSV again and saves it in one transaction; a race such as another import adding the same reference is rejected without partial writes.
7. Open **Contracts** and look at **Imported supplier contracts**. This list shows persisted supplier/contract records separately from the dashboard's demo compliance data.

## Link a certificate

1. Open **Environmental Certificates → Upload certificate**.
2. Select the imported supplier and contract, choose a PDF, and upload it.
3. Open the saved certificate to review the extracted type and dates. Edit the extracted details if needed; the supplier is derived from the selected contract and cannot be changed independently.

Searchable PDFs use PDF text extraction. Scanned PDFs need Tesseract configured with Norwegian and English language data; see the [certificate parser guide](certificate-parser.md). Only extracted metadata is retained—the uploaded PDF is discarded. Review parser results against the source before treating them as compliance evidence.

## What is and is not connected yet

- The new supplier and contracts are persisted in SQLite and shown in **Supplier onboarding**, **Imported supplier contracts**, and the certificate contract picker.
- The existing risk scores, energy metrics, supplier-directory details, and global dashboard totals still come from demo data. Importing a supplier does not fabricate those metrics or add it to the demo risk tables.
- Vehicle agreements remain a separate concept and workflow.
- Vehicle/supplier records use the vehicle database. Certificate metadata uses the separate `data/certificates.db` by default (`CERTIFICATE_DB_PATH` can override it); the API verifies that a certificate's contract ID belongs to an active supplier, rather than relying on a cross-database foreign key.

## Quick verification

From `backend/`, run `.\gradlew.bat test`. From `frontend/`, run `npm run build` and `npm test -- --run`. The relevant routes are listed in the [API reference](api.md#fleet-management).
