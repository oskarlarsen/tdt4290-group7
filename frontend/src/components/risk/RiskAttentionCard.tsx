import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { NoticeReviewDialog } from "../ui/NoticeReviewDialog";
import { formatProjectedBreach, RISK_PRIORITY_INFO } from "../../types/riskOutlook";
import type { RiskOutlookRow } from "../../types/riskOutlook";

const ATTENTION_PAGE_SIZE = 1;

function getSuggestedNoticeMessage(
  row: RiskOutlookRow,
  primary: NonNullable<RiskOutlookRow["primary"]>
): string {
  const { contract } = row;
  const subject = `${primary.title.toLowerCase()} for ${contract.contractName} (${contract.supplierName})`;
  const detail = primary.detail ? ` ${primary.detail}` : "";

  if (primary.category === "certificate" && primary.kind === "predicted") {
    return `Please review ${subject}.${detail} Please confirm the renewal plan and expected completion date.`;
  }

  if (
    primary.category === "certificate" &&
    primary.kind === "active" &&
    primary.title.toLowerCase().includes("expired")
  ) {
    return `Please address ${subject}.${detail} Please provide an update on the corrective actions planned.`;
  }

  return `Please review ${subject}.${detail} Please provide an update on any corrective actions planned.`;
}

// Uses real indicators from the top-ranked contract; avoids unsupported predictions and claims.
export function RiskAttentionCard({
  rows,
  onViewDetails,
}: {
  rows: RiskOutlookRow[];
  onViewDetails: (row: RiskOutlookRow) => void;
}) {
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);
  const [isNoticeRecorded, setIsNoticeRecorded] = useState(false);
  const [noticeMessageDraft, setNoticeMessageDraft] = useState("");
  const [page, setPage] = useState(1);

  const attentionRows = useMemo(
    () => rows.filter((riskRow) => riskRow.priority === "high" && riskRow.primary !== null),
    [rows]
  );

  useEffect(() => {
    setPage(1);
  }, [attentionRows]);

  useEffect(() => {
    if (!isNoticeRecorded) return;

    const timeout = window.setTimeout(() => setIsNoticeRecorded(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [isNoticeRecorded]);

  if (attentionRows.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(attentionRows.length / ATTENTION_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const row = attentionRows[(currentPage - 1) * ATTENTION_PAGE_SIZE];
  if (!row || !row.primary) return null;
  const { contract, primary, nextProjected } = row;
  const others = row.indicators.length - 1;

  let description = `${primary.title}: ${primary.detail}`;
  if (others > 0) {
    description += ` ${others} further indicator${others === 1 ? "" : "s"} on this contract.`;
  }
  if (nextProjected) {
    description += ` Next projected breach: ${formatProjectedBreach(nextProjected)}.`;
  }

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
                High risk: {contract.supplierName}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-neutral-600">{description}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={() => {
                setIsNoticeRecorded(false);
                setNoticeMessageDraft(getSuggestedNoticeMessage(row, primary));
                setIsNoticeOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
            >
              <Mail className="h-3.5 w-3.5" />
              Send notice
            </button>
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
            Showing {currentPage} of {attentionRows.length} high-priority contracts requiring attention
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="font-mono text-xs text-neutral-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {isNoticeOpen && (
        <NoticeReviewDialog
          riskIndicator={`${RISK_PRIORITY_INFO[row.priority].label} priority · ${primary.title}`}
          contractName={contract.contractName}
          supplierName={contract.supplierName}
          reason={description}
          message={noticeMessageDraft}
          onMessageChange={setNoticeMessageDraft}
          onCancel={() => setIsNoticeOpen(false)}
          onConfirm={() => {
            setIsNoticeOpen(false);
            setIsNoticeRecorded(true);
          }}
          wrapReason
        />
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
    </>
  );
}