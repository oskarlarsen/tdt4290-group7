import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CERTIFICATE_STANDARD_LABELS,
  formatCertificateDate,
  getCertificateStatus,
} from "../../types/certificate";
import type { CertificateRow } from "./CertificateTable";

// Built only from real fields of the most urgent certificate. Legal citations and
// penalty language from the visual reference were deliberately not reproduced.
export function CertificateAttentionCard({
  rows,
  onViewDetails,
}: {
  rows: CertificateRow[];
  onViewDetails: (row: CertificateRow) => void;
}) {
  const [activeAttentionIndex, setActiveAttentionIndex] = useState(0);

  const seenContractIds = new Set<string>();
  const attentionRows = rows.filter(({ certificate }) => {
    if (getCertificateStatus(certificate).group === "valid") return false;
    const key = certificate.contractId || certificate.id;
    if (seenContractIds.has(key)) return false;
    seenContractIds.add(key);
    return true;
  });
  const safeAttentionIndex = Math.min(activeAttentionIndex, attentionRows.length - 1);
  const row = attentionRows[safeAttentionIndex];

  useEffect(() => {
    setActiveAttentionIndex(0);
  }, [rows]);

  if (!row) return null;

  const { certificate, contract } = row;
  const info = getCertificateStatus(certificate);

  const standard = CERTIFICATE_STANDARD_LABELS[certificate.standard];
  const supplierName = contract?.supplierName ?? certificate.supplierName ?? "Unknown supplier";
  const contractName = contract?.contractName ?? "an unknown contract";
  const days = Math.abs(info.daysRemaining ?? 0);

  const title =
    info.status === "expired"
      ? "Certificate lapsed"
      : info.status === "missing-documentation"
        ? "Certificate documentation missing"
        : "Certificate expiring soon";

  const description =
    info.status === "expired"
      ? `${standard} expired on ${formatCertificateDate(certificate.validUntil!)} (${days} day${days === 1 ? "" : "s"} ago) for contract "${contractName}".`
      : info.status === "missing-documentation"
        ? `${standard} is required for contract "${contractName}", but no documentation has been submitted.`
        : `${standard} expires on ${formatCertificateDate(certificate.validUntil!)} (in ${days} day${days === 1 ? "" : "s"}) for contract "${contractName}".`;

  return (
    <>
      <div className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-red-700">
                Active attention
              </span>
              <span className="font-headline text-sm font-semibold text-neutral-900">
                {title} ({supplierName})
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-neutral-600">{description}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={() => onViewDetails(row)}
              className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              View details
            </button>
          </div>
        </div>

        <div className="-mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="text-xs text-neutral-500">
            Showing {safeAttentionIndex + 1} of {attentionRows.length} contracts requiring attention
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveAttentionIndex((index) => Math.max(0, index - 1))}
              disabled={safeAttentionIndex <= 0}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="font-mono text-xs text-neutral-500">
              Page {safeAttentionIndex + 1} of {attentionRows.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setActiveAttentionIndex((index) => Math.min(attentionRows.length - 1, index + 1))
              }
              disabled={safeAttentionIndex >= attentionRows.length - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Supplier notices are not yet sent or tracked by the backend.
        </p>
      </div>
    </>
  );
}