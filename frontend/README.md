# Vehicles

Manage suppliers and their vehicle-use agreements inside the Vehicles page. Each agreement defines a period and maximum vehicle count; planned entries also take one place.

## Run locally

Install frontend dependencies with `npm install`, then `npm run dev`. Configure the shared root `.env` with `VITE_API_BASE_URL=/api` (using the Vite proxy) and `VITE_MOCK_AUTH=false` for real backend login (independent of prototype data in `VITE_USE_MOCKS`). Vehicles always uses the backend. Sign in with the seeded admin account; the backend enforces admin access and records the user for every change.

## Workflow

1. Add a supplier using its name and organization number.
2. Expand the supplier and add an agreement with dates, maximum vehicles and an optional note.
3. Add registered vehicles or enable **Registration pending** to reserve a place without details.
4. Use **Replace vehicle** for immediate replacement, or **Register vehicle** when a planned vehicle receives its registration number.
5. Open **View details** for reporting periods, CO2 rate/calculation, deviations and historical checks. NOx and supporting facts are expandable.
6. Use **Change history** to undo eligible additions, removals, replacements, planned registrations and edits. Later dependent changes can prevent undo.

An allowance reduction is permitted even when exceeded. The counter displays only `8 of 5 vehicles`, in red. New places are blocked, while replacement still works. Dates display as `dd.mm.yyyy`; date inputs retain browser-local formatting. The interface is English.

## Development

`npm run build` checks TypeScript and produces the app. `npm test -- --run` runs the frontend suite. The [backend guide](../backend/README.md#vehicle-agreements-and-reporting) describes API fields, exact decimals, history, and the [development database reset instructions](../backend/README.md#database-reset-and-tests).

Agreement forms and fleet actions live in `components/vehicles/FleetForms.tsx`, `AgreementCard.tsx`, and `ChangeHistory.tsx`; the API and query hooks are shared. The Contracts page is unchanged.
