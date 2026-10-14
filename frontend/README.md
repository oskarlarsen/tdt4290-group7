# Admin vehicle page

Open `/admin/vehicles`. Vehicle data always comes from the real backend, even with mock login.
Supplier pages are unchanged.

## Run locally

1. Configure the root `.env` and start the backend using the [root setup guide](../README.md#backend-setup).
2. From `frontend/`, run `npm.cmd ci`, then `npm.cmd run dev`.
3. Use `VITE_API_BASE_URL=http://localhost:8080/api`. For real login, set `VITE_USE_MOCKS=false` and use the seeded admin account.
4. Open `http://localhost:5173/admin/vehicles`. Use localhost for both services so login cookies work.

Mock login: `admin@kommune.no` / `admin123`. It does not mock vehicle requests.
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

On an ambiguous save failure, inspect stored rows before trying again. Approval edits reject stale versions.
Today's approval and historical period coverage are separate; registry snapshots do not prove past registry status.

## Developer pointers

- [Vehicles.tsx](src/pages/admin/Vehicles.tsx): directory and entry actions.
- [components/vehicles](src/components/vehicles): forms, wider drawer, approval periods and deviation comparisons.
- [deviationAnalysis.ts](src/utils/deviationAnalysis.ts): projects saved facts and exact display calculations; no API calls or new deviation rules.
- [api/vehicles.ts](src/api/vehicles.ts), [types/vehicle.ts](src/types/vehicle.ts): requests and response types.
- [Backend API guide](../backend/README.md#vehicle-api): JSON examples, approval lifecycle, units and check behavior.

Verify with `npm.cmd test -- --run` and `npm.cmd run build`.
Vehicle routes still lack backend authorization; the admin route guard is not sufficient for deployment.
