import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail, X } from "lucide-react";
import type { DerivedContract } from "../../types/contract";

const RISK_PRIORITY: Record<DerivedContract["risk"], number> = { high: 0, medium: 1, compliant: 2 };

export function ContractComplianceSummary({
  contracts,
  onViewDetails,
}: {
  contracts: DerivedContract[];
  onViewDetails: (contract: DerivedContract) => void;
}) {
  const [isSendNoticeInfoOpen, setIsSendNoticeInfoOpen] = useState(false);
  const [isNoticeRecorded, setIsNoticeRecorded] = useState(false);
  const [noticeMessageDraft, setNoticeMessageDraft] = useState("");
  const [activeAttentionIndex, setActiveAttentionIndex] = useState(0);

  useEffect(() => {
    if (!isNoticeRecorded) return;

    const timeout = window.setTimeout(() => setIsNoticeRecorded(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [isNoticeRecorded]);

  const sortedContracts = [...contracts].sort(
    (a, b) => RISK_PRIORITY[a.risk] - RISK_PRIORITY[b.risk]
  );
  const attentionContracts = sortedContracts.filter((contract) => contract.risk !== "compliant");
  const safeAttentionIndex = Math.min(activeAttentionIndex, attentionContracts.length - 1);
  const current = attentionContracts[safeAttentionIndex] ?? sortedContracts[0];

  if (!current) return null;

  const needsAttention = current.risk !== "compliant";
  const noticeReason =
    current.status === "Expired"
      ? "The contract has expired."
      : current.status === "Expiring Soon"
        ? "The contract is expiring soon."
        : current.risk === "high"
          ? "Environmental compliance is non-compliant."
          : "Environmental compliance is partial and requires follow-up.";
  const noticeMessage = `Please review ${current.mainIssue || "the outstanding environmental requirements"} for ${current.contractName} and provide an update on any corrective actions planned.`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {needsAttention && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-red-700">
                  Active attention
                </span>
              )}
              <span className="font-headline text-sm font-semibold text-neutral-900">
                Selected contract: {current.contractName}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-neutral-400">
              Supplier: <span className="font-medium text-neutral-600">{current.supplierName}</span>
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {needsAttention && (
              <button
                onClick={() => {
                  setIsNoticeRecorded(false);
                  setNoticeMessageDraft(noticeMessage);
                  setIsSendNoticeInfoOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
              >
                <Mail className="h-3.5 w-3.5" />
                Send Notice
              </button>
            )}
            <button
              onClick={() => onViewDetails(current)}
              className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              View Details
            </button>
          </div>
        </div>

        <div className="mt-3 border-t border-neutral-100 pt-3">
          <div className="text-[10px] font-mono uppercase tracking-wide text-neutral-400">
            Key issue summary
          </div>
          <p className="mt-1 text-sm text-neutral-700">
            {current.mainIssue || "No open issues on record."}
          </p>
        </div>

        {needsAttention && (
          <div className="-mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
            <p className="text-xs text-neutral-500">
              Showing {safeAttentionIndex + 1} of {attentionContracts.length} contracts requiring attention
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveAttentionIndex((index) => Math.max(0, index - 1))}
                disabled={safeAttentionIndex <= 0}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="font-mono text-xs text-neutral-400">
                Page {safeAttentionIndex + 1} of {attentionContracts.length}
              </span>
              <button
                onClick={() =>
                  setActiveAttentionIndex((index) => Math.min(attentionContracts.length - 1, index + 1))
                }
                disabled={safeAttentionIndex >= attentionContracts.length - 1}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isSendNoticeInfoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
          onClick={() => setIsSendNoticeInfoOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-notice-title"
            className="w-full max-w-md rounded-xl border border-neutral-100 bg-white p-4 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="send-notice-title" className="font-headline text-lg font-semibold text-neutral-900">
                  Review notice
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">Contract</dt>
                    <dd className="text-right font-medium text-neutral-900">{current.contractName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">Supplier</dt>
                    <dd className="text-right font-medium text-neutral-900">{current.supplierName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">Reason</dt>
                    <dd className="text-right font-medium text-neutral-900">{noticeReason}</dd>
                  </div>
                </dl>
                <div className="mt-3 rounded-lg bg-neutral-50 p-3">
                  <label
                    htmlFor="notice-message"
                    className="text-xs font-medium text-neutral-500"
                  >
                    Notice message
                  </label>
                  <textarea
                    id="notice-message"
                    value={noticeMessageDraft}
                    onChange={(event) => setNoticeMessageDraft(event.target.value)}
                    rows={4}
                    className="mt-1 w-full resize-y rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm leading-5 text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-500">
                  Demo only — no email will be sent.
                </p>
              </div>
              <button
                onClick={() => setIsSendNoticeInfoOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSendNoticeInfoOpen(false)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSendNoticeInfoOpen(false);
                  setIsNoticeRecorded(true);
                }}
                className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
              >
                Send Notice
              </button>
            </div>
          </div>
        </div>
      )}

      {isNoticeRecorded && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card"
        >
          Notice recorded successfully.
        </div>
      )}
    </div>
  );
}