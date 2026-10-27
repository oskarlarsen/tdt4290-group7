# Admin vehicle and certificate pages

Open `/admin/vehicles` or `/admin/certificates`. Both pages use the real backend. Supplier pages are unchanged.

## Run locally

1. Configure the shared root `.env` and start the backend using the [root setup guide](../README.md#backend-setup).
2. From `frontend/`, run `npm.cmd ci`, then `npm.cmd run dev`.
3. Use `VITE_API_BASE_URL=http://localhost:8080/api` and `VITE_MOCK_AUTH=false` for real backend login. Keep `VITE_USE_MOCKS` independent; it only controls prototype data on other pages.
4. Open `http://localhost:5173/admin/vehicles` or `/admin/certificates`. Use localhost for both services so login cookies work.

Offline mock login (`VITE_MOCK_AUTH=true`) does not provide the administrator session required by either page. Do not expose backend secrets through `VITE_` variables.

## Vehicles

Manage suppliers and their vehicle-use agreements inside the Vehicles page. Each agreement defines a period and maximum vehicle count; planned entries also take one place.

## Workflow

1. Add a supplier using its name and organization number.
2. Expand the supplier and add an agreement with dates, maximum vehicles and an optional note.
3. Add registered vehicles or enable **Registration pending** to reserve a place without details.
4. Use **Replace vehicle** for immediate replacement, or **Register vehicle** when a planned vehicle receives its registration number.
5. Open **View details** for reporting periods, CO2 rate/calculation, deviations and historical checks. NOx and supporting facts are expandable.
6. Use **Change history** to undo eligible additions, removals, replacements, planned registrations and edits. Later dependent changes can prevent undo.

An allowance reduction is permitted even when exceeded. The counter displays only `8 of 5 vehicles`, in red. New places are blocked, while replacement still works. Dates display as `dd.mm.yyyy`; date inputs retain browser-local formatting. The interface is English.

## Certificates

- Upload a supplier certificate as a PDF (up to 8 MB and 25 pages). The backend extracts its type and issue/expiry dates and shows its current status, sorted by urgency. The overview also shows the contract reference; **Details** reveals the source filename and record ID.
- Scanned PDFs require Tesseract OCR configured on the backend; searchable PDFs use native text extraction.
- The original PDF is discarded after processing. Extracted metadata is saved in the SQLite database and survives backend restarts. Confirm parser results against the source before taking action; a missing expiry date is flagged for review.
- Administrators can edit supplier, certificate type, issue/expiry dates, and contract reference, or delete a certificate after confirmation. Editing metadata does not reprocess the PDF; upload the document again if its extracted details need to be refreshed.
- Certificate routes require a real administrator login. They are not served by mock data or mock authentication.

## Development

`npm run build` checks TypeScript and produces the app. `npm test -- --run` runs the frontend suite. The [backend guide](../backend/README.md#vehicle-agreements-and-reporting) describes API fields, exact decimals, history, and the [development database reset instructions](../backend/README.md#database-reset-and-tests).

Agreement forms and fleet actions live in `components/vehicles/FleetForms.tsx`, `AgreementCard.tsx`, and `ChangeHistory.tsx`; the API and query hooks are shared. The Contracts page is unchanged.

- [Vehicles.tsx](src/pages/admin/Vehicles.tsx): fleet directory and actions.
- [components/vehicles](src/components/vehicles): agreement forms, vehicle details, and change history.
- [Certificates.tsx](src/pages/admin/Certificates.tsx), [api/certificates.ts](src/api/certificates.ts): certificate upload and management.
- [Backend certificate API](../backend/README.md#certificate-api).
