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
  onUploaded,
  onClose,
}: {
  agreements: UploadAgreement[];
  initialAgreementId?: string;
  onUploaded?: () => void;
  onClose: () => void;
}) {
  const [agreementId, setAgreementId] = useState(initialAgreementId ?? (agreements.length === 1 ? agreements[0].id : ""));
  const [file, setFile] = useState<File | null>(null);
  const upload = useUploadSupplierCertificate();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !agreementId) return;
    upload.mutate({ file, contractId: agreementId }, { onSuccess: () => { onUploaded?.(); onClose(); } });
  }

  return (
    <VehicleDialog title="Last opp sertifikat" onClose={onClose} busy={upload.isPending}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-700">
          Avtale
          <select
            required
            value={agreementId}
            onChange={(event) => setAgreementId(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
          >
            <option value="">Velg en avtale</option>
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>{agreementLabel(agreement)}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Sertifikat-PDF
          <span className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600 hover:bg-neutral-50">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{file?.name ?? "Velg en PDF-fil"}</span>
            <input
              required
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </span>
          <span className="mt-1 block text-xs text-neutral-500">Kun PDF, maks 8 MB og 25 sider.</span>
        </label>

        <p className="text-xs text-neutral-500">
          Hvis dette erstatter et eldre sertifikat, forblir det eldre aktivt til kommunen har vurdert det nye.
        </p>

        {upload.isError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {upload.error instanceof Error ? upload.error.message : "Kunne ikke laste opp sertifikatet."}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button type="button" onClick={onClose} disabled={upload.isPending} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
            Avbryt
          </button>
          <button
            type="submit"
            disabled={!file || !agreementId || upload.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Last opp
          </button>
        </div>
      </form>
    </VehicleDialog>
  );
}
