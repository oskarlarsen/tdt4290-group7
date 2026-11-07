import { useState } from "react";
import { Download, FileUp, Plus, Trash2, Upload } from "lucide-react";
import { downloadCsvTemplate } from "../../api/onboarding";
import type { SupplierOverview } from "../../types/onboarding";
import { FUEL_TECHNOLOGIES } from "../../utils/vehicleCatalog";
import { createVehicleFormRow, vehicleRowsToCsv, type VehicleFormRow } from "../../utils/vehicleFormCsv";
import { agreementLabel } from "../../utils/agreementLabel";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50";

type Props = {
  agreements: SupplierOverview["agreements"];
  working: boolean;
  onPreview: (file: File) => void;
  onChange: () => void;
  /** Which way of entering vehicles is showing: the form, or a CSV file. */
  mode: "form" | "csv";
};

export function SupplierVehicleEntryForm({ agreements, working, onPreview, onChange, mode }: Props) {
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
    // A registered vehicle's fuel is checked with Statens vegvesen; a planned one has no plate, so it needs a fuel.
    (row.isPlanned === false || row.fuelTechnology) &&
    row.fullContractCoverage !== null &&
    (row.fullContractCoverage || (row.startYearWeek.trim() && row.endYearWeek.trim()))
  );

  return (
    <div className="space-y-4">
      {mode === "csv" && (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-600">
        <span className="mr-auto">Download the template, fill it in, then upload it for review.</span>
        <button
          type="button"
          onClick={() => void downloadCsvTemplate("vehicles")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download CSV template
        </button>
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 ${working || agreements.length === 0 ? "pointer-events-none opacity-50" : ""}`}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Upload a filled-in CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={working || agreements.length === 0}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) { onChange(); onPreview(file); }
            }}
          />
        </label>
      </div>
      )}
      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">There are no active agreements linked to this organization yet.</p>
      )}

      {mode === "form" && (
        <>
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
                    {agreementLabel(agreement)}
                  </option>
                ))}
              </select>
            </label>

            <BooleanSelect
              label="Does this vehicle have a registration plate yet?"
              value={row.isPlanned === null ? null : !row.isPlanned}
              disabled={working}
              onChange={(hasPlate) => updateRow(row.id, {
                isPlanned: hasPlate === null ? null : !hasPlate,
                registrationNumber: hasPlate === false ? "" : row.registrationNumber,
              })}
            />

            {row.isPlanned !== true && (
              <label className="block text-sm font-medium text-neutral-700">
                Registration plate
                <span className="block text-xs font-normal text-neutral-500">We look up the vehicle with Statens vegvesen, so you do not need to fill in fuel.</span>
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
              Fuel or propulsion {row.isPlanned !== true && <span className="font-normal text-neutral-500">(optional: we check it for you)</span>}
              <select
                value={row.fuelTechnology}
                onChange={(event) => updateRow(row.id, { fuelTechnology: event.target.value })}
                disabled={working}
                className={fieldClass}
                required={row.isPlanned === true}
              >
                <option value="">{row.isPlanned === true ? "Choose fuel or propulsion" : "Let Statens vegvesen decide"}</option>
                {Object.entries(FUEL_TECHNOLOGIES).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>

            <BooleanSelect
              label="Will it be used for the whole agreement period?"
              value={row.fullContractCoverage}
              disabled={working}
              onChange={(value) => updateRow(row.id, { fullContractCoverage: value })}
            />

            {row.fullContractCoverage === false && (
              <>
                <label className="block text-sm font-medium text-neutral-700">
                  Used from week
                  <input
                    type="week"
                    value={row.startYearWeek}
                    onChange={(event) => updateRow(row.id, { startYearWeek: event.target.value })}
                    disabled={working}
                    className={fieldClass}
                    required
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  Used until week
                  <input
                    type="week"
                    value={row.endYearWeek}
                    onChange={(event) => updateRow(row.id, { endYearWeek: event.target.value })}
                    disabled={working}
                    className={fieldClass}
                    required
                  />
                </label>
              </>
            )}

            <label className="block text-sm font-medium text-neutral-700">
              Reference to a supporting document <span className="font-normal text-neutral-500">(optional)</span>
              <input
                value={row.attachmentReference}
                onChange={(event) => updateRow(row.id, { attachmentReference: event.target.value })}
                disabled={working}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
              Notes <span className="font-normal text-neutral-500">(optional; do not include driver personal data)</span>
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
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Complete each vehicle’s required details. If coverage is partial, enter both year-week dates.
        </p>
      )}
        </>
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
