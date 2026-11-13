import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Trash2 } from "lucide-react";
import {
  ENERGY_EVIDENCE_EXTENSIONS,
  MAX_ENERGY_EVIDENCE_BYTES,
  deleteSupplierEnergyEvidence,
  getSupplierEnergyEvidence,
  uploadSupplierEnergyEvidence,
  type SupplierAgreement,
} from "../../api/onboarding";
import { supplierEnergyEvidenceHref } from "../../api/energy";
import { agreementLabel } from "../../utils/agreementLabel";

const fieldClass =
  "mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50";

/** Returns a message when the file can't be uploaded, so the supplier sees why before anything is sent. */
export function validateEvidenceFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ENERGY_EVIDENCE_EXTENSIONS.includes(extension)) return "Bruk en PDF-, PNG-, JPG-, CSV- eller XLSX-fil.";
  if (file.size === 0) return "Filen er tom.";
  if (file.size > MAX_ENERGY_EVIDENCE_BYTES) return `Filen er større enn ${MAX_ENERGY_EVIDENCE_BYTES / 1024 / 1024} MB.`;
  return null;
}

export function EnergyEvidencePanel({ agreements }: { agreements: SupplierAgreement[] }) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [agreementId, setAgreementId] = useState(agreements[0]?.id ?? "");
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const fileError = file ? validateEvidenceFile(file) : null;

  const evidence = useQuery({ queryKey: ["supplier-energy-evidence"], queryFn: getSupplierEnergyEvidence });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["supplier-energy-evidence"] });
  const upload = useMutation({
    mutationFn: () => uploadSupplierEnergyEvidence({ agreementId, year, quarter, file: file! }),
    onSuccess: () => {
      setFile(null);
      setFileKey((key) => key + 1);
      return refresh();
    },
  });
  const remove = useMutation({ mutationFn: deleteSupplierEnergyEvidence, onSuccess: refresh });

  return (
    <section className="rounded-xl border border-neutral-100 bg-white p-5" aria-labelledby="energy-evidence-heading">
      <h2 id="energy-evidence-heading" className="font-headline text-lg font-semibold text-neutral-900">Dokumentasjon</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Legg ved måleruttrekket eller skjermbildet fra soldashbordet som ligger bak rapporten for et kvartal. PDF, PNG, JPG, CSV eller XLSX, opptil 10 MB.
      </p>

      {agreements.length === 0 ? (
        <p className="mt-3 text-sm text-amber-700">Ingen avtaler krever energirapportering.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (file && !fileError && agreementId) upload.mutate();
          }}
          className="mt-4 grid gap-3 sm:grid-cols-4"
        >
          <label className="block text-sm font-medium text-neutral-700 sm:col-span-2">
            Avtale
            <select value={agreementId} onChange={(e) => setAgreementId(e.target.value)} className={fieldClass}>
              {agreements.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>{agreementLabel(agreement)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            År
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={fieldClass}>
              {Array.from({ length: 11 }, (_, i) => 2020 + i).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            Kvartal
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={fieldClass}>
              {[1, 2, 3, 4].map((option) => (
                <option key={option} value={option}>Q{option}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700 sm:col-span-3">
            Fil
            <input
              key={fileKey}
              type="file"
              accept={ENERGY_EVIDENCE_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`${fieldClass} file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200`}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!file || fileError !== null || upload.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              {upload.isPending ? "Laster opp…" : "Legg ved fil"}
            </button>
          </div>
          {fileError && <p role="alert" className="text-sm text-red-700 sm:col-span-4">{fileError}</p>}
          {upload.isError && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-4">{upload.error instanceof Error ? upload.error.message : "Opplasting mislyktes"}</p>
          )}
        </form>
      )}

      {evidence.isError && <p role="alert" className="mt-3 text-sm text-red-700">Kunne ikke laste filene du har lagt ved.</p>}
      {evidence.data && evidence.data.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 text-sm">
          {evidence.data.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-neutral-800">
                <span className="font-mono text-xs text-neutral-500">{item.reportingYear} Q{item.reportingQuarter} </span>
                {item.fileName}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <a href={supplierEnergyEvidenceHref(item.id)} download={item.fileName} aria-label={`Last ned ${item.fileName}`} className="inline-flex items-center gap-1 text-xs font-medium text-secondary-700 hover:text-secondary-800">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Last ned
                </a>
                {confirmingId === item.id ? (
                  <span className="inline-flex items-center gap-2 text-xs">
                    <span className="text-neutral-600">Fjerne denne filen?</span>
                    <button
                      type="button"
                      onClick={() => { remove.mutate(item.id); setConfirmingId(null); }}
                      disabled={remove.isPending}
                      aria-label={`Bekreft fjerning av ${item.fileName}`}
                      className="font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
                    >
                      Ja, fjern
                    </button>
                    <button type="button" onClick={() => setConfirmingId(null)} className="font-medium text-neutral-600 hover:text-neutral-900">Behold</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(item.id)}
                    disabled={remove.isPending}
                    aria-label={`Fjern ${item.fileName}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Fjern
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <p role="alert" className="mt-2 text-sm text-red-700">Kunne ikke fjerne filen.</p>}
    </section>
  );
}
