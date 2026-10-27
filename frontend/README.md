# Admin vehicle and certificate pages

Open `/admin/vehicles` or `/admin/certificates`. Both pages use the real backend.
Supplier pages are unchanged.

## Run locally

1. Configure the root `.env` and start the backend using the [root setup guide](../README.md#backend-setup).
2. From `frontend/`, run `npm.cmd ci`, then `npm.cmd run dev`.
3. Use `VITE_API_BASE_URL=http://localhost:8080/api`; real backend login is the default. Set `VITE_USE_MOCK_AUTH=true` only to use mock login.
4. Open `http://localhost:5173/admin/vehicles` or `/admin/certificates`. Use localhost for both services so login cookies work.

Mock login: `admin@kommune.no` / `admin123`. It does not mock vehicle or certificate requests.
Do not create a frontend `.env` or expose backend secrets through `VITE_` variables.

## Using the page

- Search/filter the vehicle directory and open a vehicle's details. The drawer uses roughly three-quarters of desktop page width and full width on small screens.
- Add trip/period statistics or approval periods individually. Applicable statistics are required; non-applicable electric/hydrogen inputs are locked. Consumption uses L/100km.
- Approval periods can overlap for recertification. Edit/revoke the specific period; contradictory fuel/category values create deviations.
- Saving statistics appends a row and checks every saved row for that plate. Repeated submissions are not deduplicated.
- Open **Deviations**, filter by priority/reporting row, and expand **Compare facts**. It shows readable labels, units, supplier/approval values and saved registry references. Numerical calculations show their inputs.
- **Check result** shows registry/check metadata; **History** opens earlier saved evidence. Browsing never performs a new registry lookup.
- **Run check** saves a new result. Force refresh bypasses the normal 14-day registry cache.
- **Upload Excel** is disabled and marked coming soon for approval/statistics batches. It does not read or upload files.

## Certificates

- Upload a supplier certificate as a PDF (up to 8 MB and 25 pages). The backend extracts its type and issue/expiry dates and shows its current status, sorted by urgency. The overview also shows the contract reference; **Details** reveals the source filename and record ID.
- Scanned PDFs require Tesseract OCR configured on the backend; searchable PDFs use native text extraction.
- The original PDF is discarded after processing. Extracted metadata is saved in the SQLite database and survives backend restarts. Confirm parser results against the source before taking action; a missing expiry date is flagged for review.
- Administrators can edit supplier, certificate type, issue/expiry dates, and contract reference, or delete a certificate after confirmation. Editing metadata does not reprocess the PDF; upload the document again if its extracted details need to be refreshed.
- Certificate routes require a real administrator login. They are not served by mock data or mock authentication.

On an ambiguous save failure, inspect stored rows before trying again. Approval edits reject stale versions.
Today's approval and historical period coverage are separate; registry snapshots do not prove past registry status.

## Developer pointers

- [Vehicles.tsx](src/pages/admin/Vehicles.tsx): directory and entry actions.
- [components/vehicles](src/components/vehicles): forms, wider drawer, approval periods and deviation comparisons.
- [deviationAnalysis.ts](src/utils/deviationAnalysis.ts): projects saved facts and exact display calculations; no API calls or new deviation rules.
- [api/vehicles.ts](src/api/vehicles.ts), [types/vehicle.ts](src/types/vehicle.ts): requests and response types.
- [Certificates.tsx](src/pages/admin/Certificates.tsx), [api/certificates.ts](src/api/certificates.ts): PDF upload and certificate overview.
- [Backend API guide](../backend/README.md#vehicle-api): JSON examples, approval lifecycle, units and check behavior.

Verify with `npm.cmd test -- --run` and `npm.cmd run build`.
Vehicle routes still lack backend authorization; the admin route guard is not sufficient for deployment.
