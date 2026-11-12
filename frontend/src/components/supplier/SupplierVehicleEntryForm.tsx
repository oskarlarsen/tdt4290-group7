import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { CsvUploadPanel } from "./CsvUploadPanel";
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
        <CsvUploadPanel entity="vehicles" disabled={working || agreements.length === 0} onPreview={onPreview} onChange={onChange} />
      )}
      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">Ingen aktive avtaler er knyttet til denne organisasjonen ennå.</p>
      )}

      {mode === "form" && (
        <>
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 font-semibold text-neutral-800">Kjøretøy {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between">
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={working}
                aria-label={`Fjern kjøretøy ${index + 1}`}
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

            <BooleanSelect
              label="Har kjøretøyet registreringsnummer ennå?"
              value={row.isPlanned === null ? null : !row.isPlanned}
              disabled={working}
              onChange={(hasPlate) => updateRow(row.id, {
                isPlanned: hasPlate === null ? null : !hasPlate,
                registrationNumber: hasPlate === false ? "" : row.registrationNumber,
              })}
            />

            {row.isPlanned !== true && (
              <label className="block text-sm font-medium text-neutral-700">
                Registreringsnummer
                <input
                  value={row.registrationNumber}
                  onChange={(event) => updateRow(row.id, { registrationNumber: event.target.value.toUpperCase() })}
                  placeholder="For eksempel AB12345"
                  autoCapitalize="characters"
                  disabled={working || row.isPlanned === null}
                  className={fieldClass}
                  required={row.isPlanned === false}
                />
                <span className="mt-1 block text-xs font-normal text-neutral-500">Vi slår opp kjøretøyet hos Statens vegvesen, så du trenger ikke fylle inn drivstoff.</span>
              </label>
            )}

            <label className="block text-sm font-medium text-neutral-700">
              Drivstoff eller framdrift {row.isPlanned !== true && <span className="font-normal text-neutral-500">(valgfritt: vi sjekker det for deg)</span>}
              <select
                value={row.fuelTechnology}
                onChange={(event) => updateRow(row.id, { fuelTechnology: event.target.value })}
                disabled={working}
                className={fieldClass}
                required={row.isPlanned === true}
              >
                <option value="">{row.isPlanned === true ? "Velg drivstoff eller framdrift" : "La Statens vegvesen avgjøre"}</option>
                {Object.entries(FUEL_TECHNOLOGIES).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </label>

            <BooleanSelect
              label="Skal det brukes i hele avtaleperioden?"
              value={row.fullContractCoverage}
              disabled={working}
              onChange={(value) => updateRow(row.id, { fullContractCoverage: value })}
            />

            {row.fullContractCoverage === false && (
              <>
                <label className="block text-sm font-medium text-neutral-700">
                  Brukt fra uke
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
                  Brukt til uke
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
              Referanse til dokumentasjon <span className="font-normal text-neutral-500">(valgfritt)</span>
              <input
                value={row.attachmentReference}
                onChange={(event) => updateRow(row.id, { attachmentReference: event.target.value })}
                disabled={working}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
              Notater <span className="font-normal text-neutral-500">(valgfritt; ikke ta med personopplysninger om sjåfører)</span>
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
          Legg til nytt kjøretøy
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={working || !isReady || agreements.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {working ? "Validerer…" : "Gjennomgå kjøretøyopplysninger"}
        </button>
      </div>
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Fyll ut de obligatoriske opplysningene for hvert kjøretøy. Hvis dekningen er delvis, oppgi begge uke-datoene.
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
        <option value="">Velg ja eller nei</option>
        <option value="true">Ja</option>
        <option value="false">Nei</option>
      </select>
    </label>
  );
}
