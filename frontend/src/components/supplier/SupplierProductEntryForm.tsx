import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { CsvUploadPanel } from "./CsvUploadPanel";
import type { SupplierOverview } from "../../types/onboarding";
import {
  createProductFormRow,
  ECOLABEL_STANDARDS,
  PRODUCT_CATEGORIES,
  productRowsToCsv,
  UNITS_OF_MEASURE,
  type ProductFormRow,
} from "../../utils/productFormCsv";
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

export function SupplierProductEntryForm({ agreements, working, onPreview, onChange, mode }: Props) {
  const [rows, setRows] = useState<ProductFormRow[]>([createProductFormRow()]);

  function updateRow(id: string, patch: Partial<ProductFormRow>) {
    onChange();
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange();
    setRows((current) => [...current, createProductFormRow()]);
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
        row.productCode.trim() &&
        row.productName.trim() &&
        row.productCategory &&
        row.ecolabelStandard &&
        (row.ecolabelStandard === "NONE" || row.licenseNumber.trim()) &&
        row.unitOfMeasure &&
        row.isRepairedOrReused !== null,
    );

  function handlePreview() {
    if (!isReady) return;
    const csv = productRowsToCsv(rows);
    onPreview(new File([csv], "product-form.csv", { type: "text/csv;charset=utf-8" }));
  }

  return (
    <div className="space-y-4">
      {mode === "csv" && (
        <CsvUploadPanel entity="products" disabled={working || agreements.length === 0} onPreview={onPreview} onChange={onChange} />
      )}
      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">Ingen aktive avtaler er knyttet til denne organisasjonen ennå.</p>
      )}

      {mode === "form" && (
        <>
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 font-semibold text-neutral-800">Produkt {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between">
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={working}
                aria-label={`Fjern produkt ${index + 1}`}
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
              Produktkategori
              <select
                value={row.productCategory}
                onChange={(event) => updateRow(row.id, { productCategory: event.target.value })}
                disabled={working}
                className={fieldClass}
                required
              >
                <option value="">Velg kategori</option>
                {Object.entries(PRODUCT_CATEGORIES).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Produktkode eller SKU
              <input
                value={row.productCode}
                onChange={(event) => updateRow(row.id, { productCode: event.target.value })}
                placeholder="For eksempel PRD-FURN-001"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Produktnavn
              <input
                value={row.productName}
                onChange={(event) => updateRow(row.id, { productName: event.target.value })}
                placeholder="For eksempel Kontorpult i heltre furu"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Miljømerkestandard
              <select
                value={row.ecolabelStandard}
                onChange={(event) =>
                  updateRow(row.id, {
                    ecolabelStandard: event.target.value,
                    licenseNumber: event.target.value === "NONE" ? "" : row.licenseNumber,
                  })
                }
                disabled={working}
                className={fieldClass}
                required
              >
                {Object.entries(ECOLABEL_STANDARDS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Lisens- eller sertifiseringsnummer
              {row.ecolabelStandard === "NONE" ? (
                <span className="font-normal text-neutral-500"> (ikke aktuelt for Ingen)</span>
              ) : (
                <span className="font-normal text-amber-600"> (påkrevd)</span>
              )}
              <input
                value={row.licenseNumber}
                onChange={(event) => updateRow(row.id, { licenseNumber: event.target.value })}
                placeholder={row.ecolabelStandard === "NONE" ? "Ikke aktuelt" : "f.eks. 2048-0012"}
                disabled={working || row.ecolabelStandard === "NONE"}
                className={fieldClass}
                required={row.ecolabelStandard !== "NONE"}
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Måleenhet
              <select
                value={row.unitOfMeasure}
                onChange={(event) => updateRow(row.id, { unitOfMeasure: event.target.value })}
                disabled={working}
                className={fieldClass}
                required
              >
                {Object.entries(UNITS_OF_MEASURE).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Reparert eller gjenbrukt produkt?
              <select
                value={row.isRepairedOrReused === null ? "" : String(row.isRepairedOrReused)}
                onChange={(event) =>
                  updateRow(row.id, {
                    isRepairedOrReused:
                      event.target.value === "" ? null : event.target.value === "true",
                  })
                }
                disabled={working}
                className={fieldClass}
                required
              >
                <option value="false">Nei (nytt produkt)</option>
                <option value="true">Ja (sirkulært / reparert / gjenbrukt)</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
              Notater <span className="font-normal text-neutral-500">(valgfritt)</span>
              <textarea
                value={row.notes}
                onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                disabled={working}
                rows={2}
                className={fieldClass}
                placeholder="Produktdetaljer, materialopprinnelse eller merknader om sirkulær økonomi..."
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
          Legg til nytt produkt
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={working || !isReady || agreements.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {working ? "Validerer…" : "Gjennomgå produktopplysninger"}
        </button>
      </div>
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Fyll ut de obligatoriske opplysningene for hvert produkt. Hvis det velges en miljømerkestandard, må lisensnummer oppgis.
        </p>
      )}
        </>
      )}
    </div>
  );
}
