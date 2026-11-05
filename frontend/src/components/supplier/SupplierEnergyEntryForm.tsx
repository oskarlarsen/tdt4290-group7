import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { SupplierOverview } from "../../types/onboarding";
import { createEnergyFormRow, energyRowsToCsv, type EnergyFormRow } from "../../utils/energyFormCsv";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50";

type Props = {
  agreements: SupplierOverview["agreements"];
  working: boolean;
  onPreview: (file: File) => void;
  onChange: () => void;
};

export function SupplierEnergyEntryForm({ agreements, working, onPreview, onChange }: Props) {
  const [rows, setRows] = useState<EnergyFormRow[]>([createEnergyFormRow()]);

  function updateRow(id: string, patch: Partial<EnergyFormRow>) {
    onChange();
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange();
    setRows((current) => [...current, createEnergyFormRow()]);
  }

  function removeRow(id: string) {
    onChange();
    setRows((current) => current.filter((row) => row.id !== id));
  }

  const isReady =
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.agreementId &&
        row.locationCode.trim() &&
        row.address.trim() &&
        row.reportingYear >= 2020 &&
        row.reportingYear <= 2030 &&
        row.electricityKwh.trim() !== "" &&
        !isNaN(Number(row.electricityKwh)) &&
        Number(row.electricityKwh) >= 0 &&
        row.districtHeatingKwh.trim() !== "" &&
        !isNaN(Number(row.districtHeatingKwh)) &&
        Number(row.districtHeatingKwh) >= 0 &&
        (row.biogasKwh.trim() === "" || (!isNaN(Number(row.biogasKwh)) && Number(row.biogasKwh) >= 0)) &&
        (row.fossilFuelKwh.trim() === "" || (!isNaN(Number(row.fossilFuelKwh)) && Number(row.fossilFuelKwh) >= 0)) &&
        (row.selfProducedSolarKwh.trim() === "" || (!isNaN(Number(row.selfProducedSolarKwh)) && Number(row.selfProducedSolarKwh) >= 0)) &&
        (row.selfProducedHeatpumpKwh.trim() === "" || (!isNaN(Number(row.selfProducedHeatpumpKwh)) && Number(row.selfProducedHeatpumpKwh) >= 0)) &&
        (row.storageAreaSqm.trim() === "" || (!isNaN(Number(row.storageAreaSqm)) && Number(row.storageAreaSqm) >= 0)) &&
        (row.workshopAreaSqm.trim() === "" || (!isNaN(Number(row.workshopAreaSqm)) && Number(row.workshopAreaSqm) >= 0)) &&
        (row.otherAreaSqm.trim() === "" || (!isNaN(Number(row.otherAreaSqm)) && Number(row.otherAreaSqm) >= 0)),
    );

  function handlePreview() {
    if (!isReady) return;
    const csv = energyRowsToCsv(rows);
    onPreview(new File([csv], "energy-form.csv", { type: "text/csv;charset=utf-8" }));
  }

  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 11 }, (_, i) => 2020 + i);

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 font-semibold text-neutral-800">Facility {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between">
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={working}
                aria-label={`Remove facility ${index + 1}`}
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

            <label className="block text-sm font-medium text-neutral-700">
              Reporting year
              <select
                value={row.reportingYear}
                onChange={(event) => updateRow(row.id, { reportingYear: Number(event.target.value) })}
                disabled={working}
                className={fieldClass}
                required
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === currentYear ? "(Current year)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Facility or location code
              <input
                value={row.locationCode}
                onChange={(event) => updateRow(row.id, { locationCode: event.target.value })}
                placeholder="For example, DEPOT-TRD-01"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Facility address
              <input
                value={row.address}
                onChange={(event) => updateRow(row.id, { address: event.target.value })}
                placeholder="For example, Kongens gate 1, 7011 Trondheim"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Energy consumption (kWh)
            </h4>
            <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm font-medium text-neutral-700">
                Electricity (kWh)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.electricityKwh}
                  onChange={(event) => updateRow(row.id, { electricityKwh: event.target.value })}
                  placeholder="e.g. 15000"
                  disabled={working}
                  className={fieldClass}
                  required
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                District heating (kWh)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.districtHeatingKwh}
                  onChange={(event) => updateRow(row.id, { districtHeatingKwh: event.target.value })}
                  placeholder="e.g. 20000"
                  disabled={working}
                  className={fieldClass}
                  required
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Biogas (kWh) <span className="font-normal text-neutral-400">(optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.biogasKwh}
                  onChange={(event) => updateRow(row.id, { biogasKwh: event.target.value })}
                  placeholder="0"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Fossil fuel (kWh) <span className="font-normal text-neutral-400">(optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.fossilFuelKwh}
                  onChange={(event) => updateRow(row.id, { fossilFuelKwh: event.target.value })}
                  placeholder="0"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Self-produced solar (kWh) <span className="font-normal text-neutral-400">(optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.selfProducedSolarKwh}
                  onChange={(event) => updateRow(row.id, { selfProducedSolarKwh: event.target.value })}
                  placeholder="0"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Self-produced heat pump (kWh) <span className="font-normal text-neutral-400">(optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.selfProducedHeatpumpKwh}
                  onChange={(event) => updateRow(row.id, { selfProducedHeatpumpKwh: event.target.value })}
                  placeholder="0"
                  disabled={working}
                  className={fieldClass}
                />
              </label>
            </div>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Facility area (m² - optional)
            </h4>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-neutral-700">
                Storage area (m²)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.storageAreaSqm}
                  onChange={(event) => updateRow(row.id, { storageAreaSqm: event.target.value })}
                  placeholder="e.g. 500"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Workshop area (m²)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.workshopAreaSqm}
                  onChange={(event) => updateRow(row.id, { workshopAreaSqm: event.target.value })}
                  placeholder="e.g. 250"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Other area (m²)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.otherAreaSqm}
                  onChange={(event) => updateRow(row.id, { otherAreaSqm: event.target.value })}
                  placeholder="e.g. 100"
                  disabled={working}
                  className={fieldClass}
                />
              </label>
            </div>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <label className="block text-sm font-medium text-neutral-700">
              Notes <span className="font-normal text-neutral-400">(optional)</span>
              <textarea
                value={row.notes}
                onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                disabled={working}
                rows={2}
                className={fieldClass}
                placeholder="Additional details regarding meter readings or shared facilities..."
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
          Add another facility
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={working || !isReady || agreements.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {working ? "Validating…" : "Review energy details"}
        </button>
      </div>

      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">There are no active agreements linked to this organization yet.</p>
      )}
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Complete the required fields for each facility (Agreement, Location code, Address, Electricity, and District heating).
        </p>
      )}
    </div>
  );
}
