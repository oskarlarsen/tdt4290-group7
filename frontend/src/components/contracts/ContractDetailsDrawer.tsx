import { useEffect } from "react";
import { X, ArrowUpRight, FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../ui/RiskBadge";
import { getEnvironmentalComplianceLabel } from "../../types/contract";
import type { DerivedContract } from "../../types/contract";

type Props = {
  contract: DerivedContract | null;
  onClose: () => void;
};

// Keep the drawer limited to real supplier-linked data; contract-specific details are not available yet.
export function ContractDetailsDrawer({ contract, onClose }: Props) {
  const navigate = useNavigate();
  const isOpen = contract !== null;

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
        aria-label={contract ? `${contract.contractName} details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {contract && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {contract.contractName}
                </h2>
                <div className="mt-1.5">
                  <RiskBadge level={contract.risk} />
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
              <Section title="Contract">
                <Field label="Contract name" value={contract.contractName} />
                <Field label="Status" value={contract.status} />
                <Field
                  label="Start date"
                  value={new Date(contract.startDate).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                />
                <Field
                  label="End date"
                  value={new Date(contract.endDate).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                />
              </Section>

              <Section title="Linked supplier">
                <Field label="Supplier" value={contract.supplierName} />
                <Field label="Org ID" value={contract.supplierOrgId} />
                <button
                  onClick={() => navigate(`/admin/suppliers?supplierId=${contract.supplierId}`)}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                >
                  View linked supplier
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Section>

              <Section title="Risk & main issue">
                <p className="text-xs text-neutral-400">
                  This is the linked supplier's risk, not an independently assessed contract
                  risk — see note below.
                </p>
                <p className="mt-1.5 text-sm text-neutral-700">
                  {contract.mainIssue || "No open issues on record."}
                </p>
              </Section>

              <Section title="Environmental compliance">
                <p className="text-sm text-neutral-700">
                  {getEnvironmentalComplianceLabel(contract.risk)}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Based on the linked supplier's current risk level, not a separate contract-level
                  assessment.
                </p>
              </Section>

              <Section title="Contract document">
                {contract.documentUrl ? (
                  <a
                    href={contract.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    <FileText className="h-4 w-4 text-neutral-400" />
                    View PDF
                    <ExternalLink className="h-3.5 w-3.5 text-neutral-400" />
                  </a>
                ) : (
                  <p className="text-sm text-neutral-400">No contract document available</p>
                )}
                <p className="mt-1.5 text-xs text-neutral-400">
                  Mock demo document — not a real contract file.
                </p>
              </Section>

              <Section title="Contract-specific details">
                <p className="text-sm text-neutral-400">
                  Start/end dates, contract value, environmental requirements, documents, and an
                  independent contract status aren't part of the current data model — this
                  contract record is currently derived entirely from its linked supplier. These
                  will populate once the backend models contracts as their own entity.
                </p>
              </Section>
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
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}