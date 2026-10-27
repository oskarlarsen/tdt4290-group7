import { useRef, useState, type FormEvent } from "react";
import {
  useCertificates,
  useDeleteCertificate,
  useUpdateCertificate,
  useUploadCertificate,
} from "../../hooks/useCertificates";
import { CertificateTable } from "../../components/certificates/CertificateTable";
import type { Certificate } from "../../types/certificate";

export default function Certificates() {
  const certificates = useCertificates();
  const upload = useUploadCertificate();
  const update = useUpdateCertificate();
  const remove = useDeleteCertificate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [supplierName, setSupplierName] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [editing, setEditing] = useState<Certificate | null>(null);

  function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    upload.mutate({ file, supplierName: supplierName.trim() }, {
      onSuccess: () => {
        setSupplierName("");
        if (fileInput.current) fileInput.current.value = "";
        setSelectedFileName("");
      },
    });
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const formData = new FormData(event.currentTarget);
    update.mutate({
      id: editing.id,
      updates: {
        supplierName: String(formData.get("supplierName")).trim(),
        certificateType: String(formData.get("certificateType")).trim(),
        issueDate: String(formData.get("issueDate")) || null,
        expiryDate: String(formData.get("expiryDate")) || null,
        contractId: String(formData.get("contractId")).trim() || null,
      },
    }, {
      onSuccess: () => setEditing(null),
    });
  }

  function confirmDelete(certificate: Certificate) {
    if (window.confirm(`Delete the ${certificate.certificateType} certificate for ${certificate.supplierName}? This cannot be undone.`)) {
      remove.mutate(certificate.id);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Environmental follow-up</p>
        <h1 className="mt-1 font-headline text-2xl font-semibold text-neutral-900">Environmental certificates</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Upload a certificate PDF to extract its type and validity dates. Verify extracted details before acting on them.
        </p>
      </header>

      <section className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
        <h2 className="font-headline text-base font-semibold text-neutral-900">Add certificate</h2>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={submitUpload}>
          <label className="min-w-52 flex-1 space-y-1.5 text-xs font-medium text-neutral-600">
            Supplier
            <input
              required
              maxLength={200}
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal text-neutral-800 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              placeholder="Supplier name"
            />
          </label>
          <div className="min-w-60 flex-1 space-y-1.5 text-xs font-medium text-neutral-600">
            <label htmlFor="certificate-pdf" className="block">Certificate PDF</label>
            <input
              ref={fileInput}
              id="certificate-pdf"
              required
              type="file"
              accept="application/pdf,.pdf"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => setSelectedFileName(event.currentTarget.files?.[0]?.name ?? "")}
              className="sr-only"
            />
            <div className="flex min-h-10 items-center gap-3 rounded-lg border border-neutral-200 px-2 py-1.5">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label="Choose certificate PDF"
                className="shrink-0 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
              >
                Choose file
              </button>
              <span className="truncate text-sm font-normal text-neutral-600" aria-live="polite">
                {selectedFileName || "No file selected"}
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={upload.isPending}
            className="min-h-9 rounded-lg bg-primary-900 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {upload.isPending ? "Processing…" : "Upload and analyze"}
          </button>
        </form>
        {upload.error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{upload.error.message}</p>}
        <p className="mt-3 text-xs leading-5 text-neutral-500">
          PDF files up to 8 MB and 25 pages are supported. Scanned documents need Tesseract OCR configured on the backend.
          Uploaded PDFs are processed but not retained; extracted certificate details are saved.
        </p>
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-headline text-base font-semibold text-neutral-900">Certificate overview</h2>
          {certificates.data && <span className="text-xs text-neutral-500">{certificates.data.length} certificates</span>}
        </div>
        {certificates.isLoading && <p role="status" className="py-8 text-center text-sm text-neutral-500">Loading certificates…</p>}
        {certificates.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{certificates.error.message}</p>}
        {certificates.isError && <button type="button" onClick={() => void certificates.refetch()} className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Retry loading</button>}
        {remove.error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{remove.error.message}</p>}
        {certificates.data && (
          <CertificateTable
            certificates={certificates.data}
            onEdit={setEditing}
            onDelete={confirmDelete}
          />
        )}
      </section>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-certificate-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
          >
            <h2 id="edit-certificate-title" className="font-headline text-lg font-semibold text-neutral-900">Edit certificate</h2>
            <p className="mt-1 text-sm text-neutral-600">Update the saved certificate details. The uploaded PDF is not stored.</p>
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={submitEdit}>
              <label className="space-y-1 text-xs font-medium text-neutral-600">
                Supplier
                <input name="supplierName" required maxLength={200} defaultValue={editing.supplierName} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal text-neutral-800" />
              </label>
              <label className="space-y-1 text-xs font-medium text-neutral-600">
                Certificate type
                <input name="certificateType" required maxLength={200} defaultValue={editing.certificateType} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal text-neutral-800" />
              </label>
              <label className="space-y-1 text-xs font-medium text-neutral-600">
                Issue date
                <input name="issueDate" type="date" defaultValue={editing.issueDate ?? ""} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal text-neutral-800" />
              </label>
              <label className="space-y-1 text-xs font-medium text-neutral-600">
                Expiry date
                <input name="expiryDate" type="date" defaultValue={editing.expiryDate ?? ""} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal text-neutral-800" />
              </label>
              <label className="space-y-1 text-xs font-medium text-neutral-600 sm:col-span-2">
                Contract reference
                <input name="contractId" maxLength={200} defaultValue={editing.contractId ?? ""} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-normal text-neutral-800" placeholder="Optional" />
              </label>
              {update.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{update.error.message}</p>}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => { setEditing(null); update.reset(); }} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Cancel</button>
                <button type="submit" disabled={update.isPending} className="rounded-lg bg-primary-900 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60">
                  {update.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
