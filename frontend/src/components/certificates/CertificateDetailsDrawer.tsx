import { useEffect } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../ui/StatusBadge";
import {
  CERTIFICATE_STANDARD_LABELS,
  CERTIFICATE_THRESHOLDS,
  formatCertificateDate,
  getCertificateStatus,
} from "../../types/certificate";
import type { CertificateStatusInfo } from "../../types/certificate";
import type { CertificateRow } from "./CertificateTable";

function describeStatus(info: CertificateStatusInfo): string {
  const days = info.daysRemaining ?? 0;
  switch (info.status) {
    case "missing-documentation":
      return "Required by the contract, but no certificate documentation has been submitted.";
    case "expired":
      return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`;
    case "critical":
    case "expiring":
      return days === 0 ? "Expires today." : `Expires in ${days} day${days === 1 ? "" : "s"}.`;
    case "valid":
      return `Valid for another ${days} days.`;
  }
}

export function CertificateDetailsDrawer({
  row,
  onClose,
}: {
  row: CertificateRow | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const isOpen = row !== null;

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const certificate = row?.certificate;
  const contract = row?.contract;
  const info = certificate ? getCertificateStatus(certificate) : null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-40 bg-neutral-900/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={certificate ? `${CERTIFICATE_STANDARD_LABELS[certificate.standard]} details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {certificate && info && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {CERTIFICATE_STANDARD_LABELS[certificate.standard]}
                </h2>
                <div className="mt-1.5">
                  <StatusBadge status={info.tone} label={info.label} />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title="Certificate">
                <Field label="Standard" value={CERTIFICATE_STANDARD_LABELS[certificate.standard]} />
                <Field label="Certificate no." value={certificate.certificateNumber ?? "No certificate on file"} />
                <Field
                  label="Valid until"
                  value={certificate.validUntil ? formatCertificateDate(certificate.validUntil) : "Not submitted"}
                />
                {certificate.issueDate && (
                  <Field label="Issued" value={formatCertificateDate(certificate.issueDate)} />
                )}
                {certificate.sourceFile && <Field label="Source file" value={certificate.sourceFile} />}
              </Section>

              <Section title="Status">
                <p className="text-sm text-neutral-700">{describeStatus(info)}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  Calculated from the valid-until date. Provisional thresholds: critical within{" "}
                  {CERTIFICATE_THRESHOLDS.criticalDays} days, expiring within{" "}
                  {CERTIFICATE_THRESHOLDS.yellowDays} days.
                </p>
              </Section>

              <Section title="Contract & supplier">
                {contract ? (
                  <>
                    <Field label="Contract" value={contract.contractName} />
                    <Field label="Supplier" value={contract.supplierName} />
                    <Field label="Org ID" value={contract.supplierOrgId} />
                    <button
                      onClick={() => navigate(`/admin/suppliers?supplierId=${contract.supplierId}`)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                    >
                      View supplier
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <Field label="Supplier" value={certificate.supplierName ?? "Not recorded"} />
                )}
              </Section>

              <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
                Extracted details should be reviewed before being used as compliance evidence. The
                original PDF is not retained, and certificates are not yet linked to live contract records.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}