import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { SupplierOverview } from "../../types/onboarding";
import { FUEL_TECHNOLOGIES } from "../../utils/vehicleCatalog";
import { createVehicleFormRow, vehicleRowsToCsv, type VehicleFormRow } from "../../utils/vehicleFormCsv";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50";

type Props = {
  agreements: SupplierOverview["agreements"];
  working: boolean;
  onPreview: (file: File) => void;
  onChange: () => void;
};

export function SupplierVehicleEntryForm({ agreements, working, onPreview, onChange }: Props) {
  const [rows, setRows] = useState<VehicleFormRow[]>([createVehicleFormRow()]);

  function updateRow(id: string, patch: Partial<VehicleFormRow>) {
    onChange();
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addRow() {
    onChange();
    setRows((current) => [...current, createVehicleFormRow()]);
  }

  function removeRow(id: string) {
    onChange();
    setRows((current) => current.filter((row) => row.id !== id));
  }

  function handlePreview() {
    if (!isReady) return;
    const csv = vehicleRowsToCsv(rows);
    onPreview(new File([csv], "vehicle-form.csv", { type: "text/csv;charset=utf-8" }));
  }

  const isReady = rows.length > 0 && rows.every((row) =>
    row.agreementId &&
    (row.isPlanned === true || row.registrationNumber.trim()) &&
    row.isPlanned !== null &&
    row.fuelTechnology &&
    row.isHybrid !== null &&
    row.fullContractCoverage !== null &&
    (row.fullContractCoverage || (row.startYearWeek.trim() && row.endYearWeek.trim()))
  );

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 font-semibold text-neutral-800">Vehicle {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between">
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={working}
                aria-label={`Remove vehicle ${index + 1}`}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              Agreement
              <select
                value={row.agreementId}
                onChange={(event) => updateRow(row.id, { agreementId: event.target.value })}
                disabled={working || agreements.length === 0}
                className={fieldClass}
                required
              >
                <option value="">Choose an agreement</option>
                {agreements.map((agreement) => (
                  <option key={agreement.id} value={agreement.id}>
                    {agreement.note || agreement.id}
                  </option>
                ))}
              </select>
            </label>

            <BooleanSelect
              label="Is this vehicle planned?"
              value={row.isPlanned}
              disabled={working}
              onChange={(value) => updateRow(row.id, {
                isPlanned: value,
                registrationNumber: value ? "" : row.registrationNumber,
              })}
            />

            {row.isPlanned !== true && (
              <label className="block text-sm font-medium text-neutral-700">
                Vehicle registration plate
                <input
                  value={row.registrationNumber}
                  onChange={(event) => updateRow(row.id, { registrationNumber: event.target.value.toUpperCase() })}
                  placeholder="For example, AB12345"
                  autoCapitalize="characters"
                  disabled={working || row.isPlanned === null}
                  className={fieldClass}
                  required={row.isPlanned === false}
                />
              </label>
            )}

            <label className="block text-sm font-medium text-neutral-700">
              Fuel or propulsion
              <select
                value={row.fuelTechnology}
                onChange={(event) => updateRow(row.id, { fuelTechnology: event.target.value })}
                disabled={working}
                className={fieldClass}
                required
              >
                <option value="">Choose fuel or propulsion</option>
                {Object.entries(FUEL_TECHNOLOGIES).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>

            <BooleanSelect
              label="Is it a hybrid vehicle?"
              value={row.isHybrid}
              disabled={working}
              onChange={(value) => updateRow(row.id, { isHybrid: value })}
            />

            <BooleanSelect
              label="Does it cover the full agreement period?"
              value={row.fullContractCoverage}
              disabled={working}
              onChange={(value) => updateRow(row.id, { fullContractCoverage: value })}
            />

            {row.fullContractCoverage === false && (
              <>
                <label className="block text-sm font-medium text-neutral-700">
                  Coverage starts (year and week)
                  <input
                    value={row.startYearWeek}
                    onChange={(event) => updateRow(row.id, { startYearWeek: event.target.value.toUpperCase() })}
                    placeholder="2026-W08"
                    pattern="[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])"
                    disabled={working}
                    className={fieldClass}
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Coverage ends (year and week)
                  <input
                    value={row.endYearWeek}
                    onChange={(event) => updateRow(row.id, { endYearWeek: event.target.value.toUpperCase() })}
                    placeholder="2026-W52"
                    pattern="[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])"
                    disabled={working}
                    className={fieldClass}
                    required
                  />
                </label>
              </>
            )}

            <label className="block text-sm font-medium text-neutral-700">
              Supporting document reference <span className="font-normal text-neutral-400">(optional)</span>
              <input
                value={row.attachmentReference}
                onChange={(event) => updateRow(row.id, { attachmentReference: event.target.value })}
                disabled={working}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
              Notes <span className="font-normal text-neutral-400">(optional; do not include driver personal data)</span>
              <textarea
                value={row.notes}
                onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                disabled={working}
                rows={2}
                className={fieldClass}
              />
            </label>
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={working || rows.length >= 100}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add another vehicle
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={working || !isReady || agreements.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {working ? "Validating…" : "Review vehicle details"}
        </button>
      </div>
      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">There are no active agreements linked to this organization yet.</p>
      )}
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Complete each vehicle’s required details. If coverage is partial, enter both year-week dates.
        </p>
      )}
    </div>
  );
}

function BooleanSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean | null;
  disabled: boolean;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      <select
        value={value === null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}
        disabled={disabled}
        className={fieldClass}
        required
      >
        <option value="">Choose yes or no</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}
