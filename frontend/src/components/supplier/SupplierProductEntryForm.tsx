import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { SupplierOverview } from "../../types/onboarding";
import {
  createProductFormRow,
  ECOLABEL_STANDARDS,
  PRODUCT_CATEGORIES,
  productRowsToCsv,
  UNITS_OF_MEASURE,
  type ProductFormRow,
} from "../../utils/productFormCsv";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50";

type Props = {
  agreements: SupplierOverview["agreements"];
  working: boolean;
  onPreview: (file: File) => void;
  onChange: () => void;
};

export function SupplierProductEntryForm({ agreements, working, onPreview, onChange }: Props) {
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
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-1 font-semibold text-neutral-800">Product {index + 1}</legend>
          <div className="mb-4 flex items-center justify-between">
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                disabled={working}
                aria-label={`Remove product ${index + 1}`}
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
              Product category
              <select
                value={row.productCategory}
                onChange={(event) => updateRow(row.id, { productCategory: event.target.value })}
                disabled={working}
                className={fieldClass}
                required
              >
                <option value="">Choose category</option>
                {Object.entries(PRODUCT_CATEGORIES).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Product code or SKU
              <input
                value={row.productCode}
                onChange={(event) => updateRow(row.id, { productCode: event.target.value })}
                placeholder="For example, PRD-FURN-001"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Product name
              <input
                value={row.productName}
                onChange={(event) => updateRow(row.id, { productName: event.target.value })}
                placeholder="For example, Office Desk Solid Pine"
                disabled={working}
                className={fieldClass}
                required
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Ecolabel standard
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
              License or certification number
              {row.ecolabelStandard === "NONE" ? (
                <span className="font-normal text-neutral-400"> (not applicable for None)</span>
              ) : (
                <span className="font-normal text-amber-600"> (required)</span>
              )}
              <input
                value={row.licenseNumber}
                onChange={(event) => updateRow(row.id, { licenseNumber: event.target.value })}
                placeholder={row.ecolabelStandard === "NONE" ? "Not applicable" : "e.g. 2048-0012"}
                disabled={working || row.ecolabelStandard === "NONE"}
                className={fieldClass}
                required={row.ecolabelStandard !== "NONE"}
              />
            </label>

            <label className="block text-sm font-medium text-neutral-700">
              Unit of measure
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
              Repaired or reused product?
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
                <option value="false">No (New product)</option>
                <option value="true">Yes (Circular / Repaired / Reused)</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
              Notes <span className="font-normal text-neutral-400">(optional)</span>
              <textarea
                value={row.notes}
                onChange={(event) => updateRow(row.id, { notes: event.target.value })}
                disabled={working}
                rows={2}
                className={fieldClass}
                placeholder="Product specifics, material origins, or circular economy notes..."
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
          Add another product
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={working || !isReady || agreements.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {working ? "Validating…" : "Review product details"}
        </button>
      </div>

      {agreements.length === 0 && (
        <p className="text-sm text-amber-700">There are no active agreements linked to this organization yet.</p>
      )}
      {!isReady && agreements.length > 0 && (
        <p className="text-xs text-neutral-500">
          Complete each product’s required details. If an ecolabel standard is chosen, the license number is required.
        </p>
      )}
    </div>
  );
}
