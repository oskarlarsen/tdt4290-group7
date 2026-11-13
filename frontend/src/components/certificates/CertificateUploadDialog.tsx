import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { useUploadCertificate } from "../../hooks/useCertificates";
import type { CertificateContract } from "../../types/certificate";

export function CertificateUploadDialog({
  contracts,
  initialContractId,
  onUploaded,
  onClose,
}: {
  contracts: CertificateContract[];
  /** Opens with this agreement already chosen, for a renewal. */
  initialContractId?: string;
  onUploaded?: () => void;
  onClose: () => void;
}) {
  // The admin types to search supplier name, org number or saksnr; the text must match one agreement exactly.
  const optionLabel = (contract: CertificateContract) =>
    `${contract.supplierName} (${contract.supplierOrgId}) — ${contract.contractName}`;
  const initial = contracts.find((contract) => contract.id === initialContractId);
  const [typed, setTyped] = useState(initial ? optionLabel(initial) : "");
  const [file, setFile] = useState<File | null>(null);
  const upload = useUploadCertificate();
  const selectedContract = contracts.find((contract) => optionLabel(contract) === typed.trim());

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !selectedContract) return;
    upload.mutate(
      { file, supplierName: selectedContract.supplierName, contractId: selectedContract.id },
      { onSuccess: () => { onUploaded?.(); onClose(); } },
    );
  }


  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-certificate-title"
        className="w-full max-w-md rounded-xl border border-neutral-100 bg-white p-5 shadow-card"
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-certificate-title" className="font-headline text-lg font-semibold text-neutral-900">
              Last opp leverandørsertifikat
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Velg leverandør og avtale slik at sertifikatproblemer vises under Risiko og prediksjon.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-neutral-700">
          Leverandør og avtale
          <input
            required
            list="certificate-agreements"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Skriv inn leverandør, organisasjonsnummer eller saksnr"
            autoComplete="off"
            className="mt-1.5 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
          />
          <datalist id="certificate-agreements">
            {contracts.map((contract) => (
              <option key={contract.id} value={optionLabel(contract)} />
            ))}
          </datalist>
          {typed.trim() && !selectedContract && (
            <span className="mt-1 block text-xs font-normal text-neutral-500">Velg et av forslagene for å fortsette.</span>
          )}
        </label>

        <label className="mt-4 block text-sm font-medium text-neutral-700">
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

        {upload.isError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {upload.error instanceof Error ? upload.error.message : "Opplasting av sertifikat mislyktes. Prøv igjen."}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={upload.isPending}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={!file || !selectedContract || upload.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {upload.isPending ? "Henter ut data…" : "Last opp og hent ut data"}
          </button>
        </div>
      </form>
    </div>
  );
}
