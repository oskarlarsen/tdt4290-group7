import type { FormEvent } from "react";
import { X } from "lucide-react";
import { useUpdateCertificate } from "../../hooks/useCertificates";
import type { Certificate } from "../../types/certificate";

export function CertificateEditDialog({
  certificate,
  onClose,
}: {
  certificate: Certificate;
  onClose: () => void;
}) {
  const update = useUpdateCertificate();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    update.mutate(
      {
        id: certificate.id,
        updates: {
          supplierName: String(formData.get("supplierName")).trim(),
          certificateType: String(formData.get("certificateType")).trim(),
          issueDate: String(formData.get("issueDate")) || null,
          expiryDate: String(formData.get("expiryDate")) || null,
          contractId: String(formData.get("contractId")).trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
      onClick={() => {
        if (!update.isPending) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-certificate-title"
        className="w-full max-w-lg rounded-xl border border-neutral-100 bg-white p-5 shadow-card"
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="edit-certificate-title" className="font-headline text-lg font-semibold text-neutral-900">
              Edit certificate details
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Correct extracted metadata. The original PDF is not retained.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={update.isPending}
            aria-label="Close"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-neutral-700">
            Supplier
            <input
              required
              maxLength={200}
              name="supplierName"
              defaultValue={certificate.supplierName ?? ""}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Certificate type
            <input
              required
              maxLength={200}
              name="certificateType"
              defaultValue={certificate.certificateType ?? "Unknown"}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Issue date
            <input
              type="date"
              name="issueDate"
              defaultValue={certificate.issueDate ?? ""}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Expiry date
            <input
              type="date"
              name="expiryDate"
              defaultValue={certificate.validUntil ?? ""}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </label>
          <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
            Contract reference
            <input
              maxLength={200}
              name="contractId"
              defaultValue={certificate.contractId}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </label>
        </div>

        {update.isError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {update.error instanceof Error ? update.error.message : "Could not update certificate."}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={update.isPending}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
