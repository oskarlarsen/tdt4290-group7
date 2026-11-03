import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Download, FileUp, Loader2, Plus, SearchCheck } from "lucide-react";
import { saveSupplier } from "../../api/vehicles";
import { useFleet } from "../../hooks/useVehicles";
import { useImportContractCsv, usePreviewContractCsv } from "../../hooks/useProcurementContracts";

function downloadTemplate() {
  const csv = "contractName,contractReference,startDate,endDate\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "supplier-contracts-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SupplierOnboarding() {
  const fleet = useFleet();
  const previewCsv = usePreviewContractCsv();
  const importCsv = useImportContractCsv();
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [supplierError, setSupplierError] = useState("");

  const suppliers = fleet.data?.suppliers ?? [];
  const preview = previewCsv.data;
  const busy = previewCsv.isPending || importCsv.isPending;

  async function handleCreateSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupplierError("");
    try {
      const created = await saveSupplier({ name: supplierName.trim(), orgNumber: orgNumber.trim() });
      await fleet.refetch();
      setSupplierId(created.id);
      setSupplierName("");
      setOrgNumber("");
    } catch (error) {
      setSupplierError(error instanceof Error ? error.message : "Could not create supplier.");
    }
  }

  async function handleFileChange(file: File | undefined) {
    previewCsv.reset();
    importCsv.reset();
    setCsv("");
    setFileName(file?.name ?? "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSupplierError("Choose a .csv file.");
      return;
    }
    setSupplierError("");
    setCsv(await file.text());
  }

  function handlePreview() {
    if (!supplierId || !csv) return;
    importCsv.reset();
    previewCsv.mutate({ supplierId, csv });
  }

  function handleImport() {
    if (!supplierId || !csv || !preview || preview.issues.length > 0 || preview.validRows.length === 0) return;
    importCsv.mutate({ supplierId, csv });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Supplier administration</p>
        <h1 className="mt-2 font-headline text-2xl font-semibold text-neutral-900">Supplier onboarding</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">
          Create or select a supplier, validate its service-contract CSV, then import all contracts together.
        </p>
      </header>

      <section className="rounded-xl border border-neutral-100 bg-white p-5">
        <h2 className="font-headline text-base font-semibold text-neutral-900">1. Add a supplier</h2>
        <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={handleCreateSupplier}>
          <label className="text-xs font-medium text-neutral-700">
            Supplier name
            <input required maxLength={200} value={supplierName} onChange={(event) => setSupplierName(event.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900" />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Organization number
            <input required inputMode="numeric" maxLength={9} value={orgNumber} onChange={(event) => setOrgNumber(event.target.value)}
              placeholder="9 digits" className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900" />
          </label>
          <button type="submit" className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
            <Plus className="h-4 w-4" /> Create supplier
          </button>
        </form>
        {supplierError && <p role="alert" className="mt-3 text-sm text-red-700">{supplierError}</p>}
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white p-5">
        <h2 className="font-headline text-base font-semibold text-neutral-900">2. Select supplier and upload contracts</h2>
        {fleet.isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading suppliers…</div>
        ) : fleet.isError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">Could not load suppliers. Refresh and try again.</p>
        ) : (
          <>
            <label className="mt-3 block max-w-lg text-xs font-medium text-neutral-700">
              Supplier
              <select value={supplierId} onChange={(event) => { setSupplierId(event.target.value); previewCsv.reset(); importCsv.reset(); }}
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-normal">
                <option value="">Select a supplier…</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} — {supplier.orgNumber}</option>)}
              </select>
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                <Download className="h-4 w-4" /> Download CSV template
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                <FileUp className="h-4 w-4" /> {fileName || "Choose contracts CSV"}
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void handleFileChange(event.target.files?.[0])} />
              </label>
              <button type="button" onClick={handlePreview} disabled={!supplierId || !csv || busy}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                {previewCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
                Validate CSV
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Required columns, in order: <code>contractName,contractReference,startDate,endDate</code>. Dates use YYYY-MM-DD. Maximum 5,000 rows and 2 MB.
            </p>
            {previewCsv.isError && <p role="alert" className="mt-3 text-sm text-red-700">{previewCsv.error.message}</p>}
            {preview && (
              <div className="mt-4 space-y-3">
                {preview.issues.length > 0 ? (
                  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <h3 className="text-sm font-semibold text-red-800">Fix these issues before importing</h3>
                    <ul className="mt-2 space-y-1 text-xs text-red-700">
                      {preview.issues.map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`}>Row {issue.row} · {issue.field}: {issue.message}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> {preview.validRows.length} contract{preview.validRows.length === 1 ? "" : "s"} ready to import
                  </p>
                )}
                {preview.validRows.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-neutral-100">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-50 text-neutral-500"><tr>
                        <th className="px-3 py-2">Row</th><th className="px-3 py-2">Contract</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th>
                      </tr></thead>
                      <tbody>{preview.validRows.map((row) => <tr key={row.row} className="border-t border-neutral-100 text-neutral-700">
                        <td className="px-3 py-2">{row.row}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2">{row.reference}</td><td className="px-3 py-2">{row.startDate}</td><td className="px-3 py-2">{row.endDate}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                )}
                {importCsv.isError && <p role="alert" className="text-sm text-red-700">{importCsv.error.message}</p>}
                {importCsv.isSuccess && <p role="status" className="text-sm font-medium text-emerald-700">Imported {importCsv.data.imported} contract{importCsv.data.imported === 1 ? "" : "s"} successfully.</p>}
                <button type="button" onClick={handleImport} disabled={preview.issues.length > 0 || preview.validRows.length === 0 || importCsv.isPending || importCsv.isSuccess}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {importCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Import contracts
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
