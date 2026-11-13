import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { CsvUploadPanel } from "./CsvUploadPanel";
import type { SupplierOverview } from "../../types/onboarding";
import { createEnergyFormRow, energyRowsToCsv, type EnergyFormRow } from "../../utils/energyFormCsv";
import { agreementLabel } from "../../utils/agreementLabel";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50";

type Props = {
  agreements: SupplierOverview["agreements"];
  working: boolean;
  onPreview: (file: File) => void;
  onChange: () => void;
  /** Which way of entering data is showing: the form, or a CSV file. */
  mode: "form" | "csv";
};

const KWH_FIELDS: { key: keyof EnergyFormRow; label: string; required: boolean }[] = [
  { key: "electricityKwh", label: "Strøm", required: true },
  { key: "districtHeatingKwh", label: "Fjernvarme", required: true },
  { key: "biogasKwh", label: "Biogass", required: false },
  { key: "fossilFuelKwh", label: "Fossilt brensel", required: false },
  { key: "selfProducedSolarKwh", label: "Sol", required: false },
  { key: "selfProducedHeatpumpKwh", label: "Varmepumpe", required: false },
  { key: "gooCoveredKwh", label: "Dekket av GoO", required: false },
];

/** Plain-language reasons a row cannot be reviewed yet (errors) or deserves a second look (warnings). */
function rowMessages(row: EnergyFormRow) {
  const errors: string[] = [];
  for (const { key, label, required } of KWH_FIELDS) {
    const text = String(row[key]).trim();
    if (text === "") continue; // an empty required field is covered by the browser's own "required" hint
    const value = Number(text);
    if (Number.isNaN(value)) errors.push(`${label} må være et tall.`);
    else if (value < 0) errors.push(`${label} kan ikke være negativ.`);
    else if (required && value > 10_000_000_000) errors.push(`${label} er urealistisk stor.`);
  }
  const total = ["electricityKwh", "districtHeatingKwh", "biogasKwh", "fossilFuelKwh", "selfProducedSolarKwh"]
    .reduce((sum, key) => sum + (Number(String(row[key as keyof EnergyFormRow]).trim()) || 0), 0);
  const goo = Number(row.gooCoveredKwh.trim()) || 0;
  const warnings = goo > total && total > 0 ? ["kWh dekket av GoO er høyere enn total energi som er oppgitt. Kontroller tallene."] : [];
  return { errors, warnings };
}

export function SupplierEnergyEntryForm({ agreements, working, onPreview, onChange, mode }: Props) {
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
        row.reportingQuarter >= 1 &&
        row.reportingQuarter <= 4 &&
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
        (row.gooCoveredKwh.trim() === "" || (!isNaN(Number(row.gooCoveredKwh)) && Number(row.gooCoveredKwh) >= 0)) &&
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
      {mode === "csv" && (
        <CsvUploadPanel entity="energy" disabled={working || agreements.length === 0} onPreview={onPreview} onChange={onChange} />
      )}
      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">Ingen aktive avtaler er knyttet til denne organisasjonen ennå.</p>
      )}

      {mode === "form" && (
        <>
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 font-semibold text-neutral-800">Anlegg {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between">
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={working}
                aria-label={`Fjern anlegg ${index + 1}`}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Fjern
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-700">
              Avtale
              <select
                value={row.agreementId}
                onChange={(event) => updateRow(row.id, { agreementId: event.target.value })}
                disabled={working || agreements.length === 0}
                className={fieldClass}
                required
              >
                <option value="">Velg en avtale</option>
                {agreements.map((agreement) => (
                  <option key={agreement.id} value={agreement.id}>
                    {agreementLabel(agreement)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Rapporteringsår
              <select
                value={row.reportingYear}
                onChange={(event) => updateRow(row.id, { reportingYear: Number(event.target.value) })}
                disabled={working}
                className={fieldClass}
                required
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === currentYear ? "(inneværende år)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Kvartal
              <select
                value={row.reportingQuarter}
                onChange={(event) => updateRow(row.id, { reportingQuarter: Number(event.target.value) })}
                disabled={working}
                className={fieldClass}
                required
              >
                {[1, 2, 3, 4].map((quarter) => (
                  <option key={quarter} value={quarter}>
                    Q{quarter}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Anleggs- eller lokasjonskode
              <input
                value={row.locationCode}
                onChange={(event) => updateRow(row.id, { locationCode: event.target.value })}
                placeholder="For eksempel DEPOT-TRD-01"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Anleggsadresse
              <input
                value={row.address}
                onChange={(event) => updateRow(row.id, { address: event.target.value })}
                placeholder="For eksempel Kongens gate 1, 7011 Trondheim"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Energiforbruk (kWh)
            </h4>
            {(() => {
              const { errors, warnings } = rowMessages(row);
              return (
                <>
                  {errors.length > 0 && (
                    <ul role="alert" className="mt-2 space-y-0.5 text-xs font-medium text-red-700">
                      {errors.map((message) => <li key={message}>{message}</li>)}
                    </ul>
                  )}
                  {warnings.length > 0 && (
                    <ul role="status" className="mt-2 space-y-0.5 text-xs font-medium text-amber-800">
                      {warnings.map((message) => <li key={message}>{message}</li>)}
                    </ul>
                  )}
                </>
              );
            })()}
            <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm font-medium text-neutral-700">
                Strøm (kWh)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.electricityKwh}
                  onChange={(event) => updateRow(row.id, { electricityKwh: event.target.value })}
                  placeholder="f.eks. 15000"
                  disabled={working}
                  className={fieldClass}
                  required
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Fjernvarme (kWh)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.districtHeatingKwh}
                  onChange={(event) => updateRow(row.id, { districtHeatingKwh: event.target.value })}
                  placeholder="f.eks. 20000"
                  disabled={working}
                  className={fieldClass}
                  required
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Biogass (kWh) <span className="font-normal text-neutral-500">(valgfritt)</span>
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
                Fossilt brensel (kWh) <span className="font-normal text-neutral-500">(valgfritt)</span>
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
                Egenprodusert sol (kWh) <span className="font-normal text-neutral-500">(valgfritt)</span>
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
                Egenprodusert varmepumpe (kWh) <span className="font-normal text-neutral-500">(valgfritt)</span>
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
              Opprinnelsesgarantier (GoO)
            </h4>
            <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm font-medium text-neutral-700">
                Dekket av opprinnelsesgarantier (GoO) (kWh) <span className="font-normal text-neutral-500">(valgfritt)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.gooCoveredKwh}
                  onChange={(event) => updateRow(row.id, { gooCoveredKwh: event.target.value })}
                  placeholder="0"
                  disabled={working}
                  className={fieldClass}
                />
              </label>
            </div>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Anleggsareal (m² – valgfritt)
            </h4>
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-neutral-700">
                Lagerareal (m²)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.storageAreaSqm}
                  onChange={(event) => updateRow(row.id, { storageAreaSqm: event.target.value })}
                  placeholder="f.eks. 500"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Verkstedareal (m²)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.workshopAreaSqm}
                  onChange={(event) => updateRow(row.id, { workshopAreaSqm: event.target.value })}
                  placeholder="f.eks. 250"
                  disabled={working}
                  className={fieldClass}
                />
              </label>

              <label className="block text-sm font-medium text-neutral-700">
                Annet areal (m²)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.otherAreaSqm}
                  onChange={(event) => updateRow(row.id, { otherAreaSqm: event.target.value })}
                  placeholder="f.eks. 100"
                  disabled={working}
                  className={fieldClass}
                />
              </label>
            </div>
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3">
            <label className="block text-sm font-medium text-neutral-700">
              Notater <span className="font-normal text-neutral-500">(valgfritt)</span>
              <textarea
                value={row.notes}
                onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                disabled={working}
                rows={2}
                className={fieldClass}
                placeholder="Tilleggsopplysninger om måleravlesninger eller delte anlegg..."
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
          Legg til nytt anlegg
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={working || !isReady || agreements.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {working ? "Validerer…" : "Gjennomgå energiopplysninger"}
        </button>
      </div>
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Fyll ut de obligatoriske feltene for hvert anlegg (avtale, lokasjonskode, adresse, strøm og fjernvarme).
        </p>
      )}
        </>
      )}
    </div>
  );
}
