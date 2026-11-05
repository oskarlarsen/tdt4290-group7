import { useState, type FormEvent } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { VehicleDialog } from "../vehicles/VehicleDialog";
import { useUploadSupplierCertificate } from "../../hooks/useCertificates";
import { agreementLabel } from "../../utils/agreementLabel";

export type UploadAgreement = { id: string; note: string; saksnr: string | null };

/** A supplier adds a certificate to one of its own agreements. A renewal pre-selects the agreement. */
export function SupplierCertificateUploadDialog({
  agreements,
  initialAgreementId,
  onClose,
}: {
  agreements: UploadAgreement[];
  initialAgreementId?: string;
  onClose: () => void;
}) {
  const [agreementId, setAgreementId] = useState(initialAgreementId ?? (agreements.length === 1 ? agreements[0].id : ""));
  const [file, setFile] = useState<File | null>(null);
  const upload = useUploadSupplierCertificate();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !agreementId) return;
    upload.mutate({ file, contractId: agreementId }, { onSuccess: onClose });
  }

  return (
    <VehicleDialog title="Upload certificate" onClose={onClose} busy={upload.isPending}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-700">
          Agreement
          <select
            required
            value={agreementId}
            onChange={(event) => setAgreementId(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
          >
            <option value="">Choose an agreement</option>
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>{agreementLabel(agreement)}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Certificate PDF
          <span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600 hover:bg-neutral-50">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{file?.name ?? "Choose a PDF file"}</span>
            <input
              required
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </span>
          <span className="mt-1 block text-xs text-neutral-400">PDF only, up to 8 MB and 25 pages.</span>
        </label>

        <p className="text-xs text-neutral-500">
          If this replaces an older certificate, the older one stays active until the municipality has reviewed the new one.
        </p>

        {upload.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {upload.error instanceof Error ? upload.error.message : "Could not upload the certificate."}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button type="button" onClick={onClose} disabled={upload.isPending} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!file || !agreementId || upload.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </button>
        </div>
      </form>
    </VehicleDialog>
  );
}
