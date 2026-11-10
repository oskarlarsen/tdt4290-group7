import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { NoticeReviewDialog } from "../ui/NoticeReviewDialog";
import { useSendSupplierNotice } from "../../hooks/useSupplierNotices";
import { formatKwh, formatPercent } from "../../types/energy";
import { getEnergyNoticeReason, getEnergySuggestedNoticeMessage } from "./energyFilters";
import type { EnergyRow } from "./EnergyTable";

const ATTENTION_PAGE_SIZE = 1;

export function EnergyAttentionCard({
  rows,
  onViewDetails,
}: {
  rows: EnergyRow[];
  onViewDetails: (row: EnergyRow) => void;
}) {
  const [noticeRow, setNoticeRow] = useState<EnergyRow | null>(null);
  const [noticeMessageDraft, setNoticeMessageDraft] = useState("");
  const [isNoticeRecorded, setIsNoticeRecorded] = useState(false);
  const [page, setPage] = useState(1);

  const sendNotice = useSendSupplierNotice(noticeRow?.contract?.supplierId ?? null);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  useEffect(() => {
    if (!isNoticeRecorded) return;

    const timeout = window.setTimeout(() => setIsNoticeRecorded(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [isNoticeRecorded]);

  if (rows.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(rows.length / ATTENTION_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const row = rows[(currentPage - 1) * ATTENTION_PAGE_SIZE];
  const { record, requirement, contract, analysis } = row;
  const supplierName = contract?.supplierName ?? "Unknown supplier";
  const contractName = contract?.contractName ?? "an unknown contract";
  const selectedNoticeReason = noticeRow ? getEnergyNoticeReason(noticeRow) : null;

  function openNotice(selectedRow: EnergyRow) {
    const message = getEnergySuggestedNoticeMessage(selectedRow);
    if (!message) return;
    setIsNoticeRecorded(false);
    setNoticeMessageDraft(message);
    setNoticeRow(selectedRow);
  }

  function closeNotice() {
    setNoticeRow(null);
    setNoticeMessageDraft("");
  }

  function confirmNotice() {
    if (!noticeRow) return;
    sendNotice.mutate({
      title: "Energy Compliance Follow-up",
      message: noticeMessageDraft
    }, {
      onSuccess: () => {
        setNoticeRow(null);
        setNoticeMessageDraft("");
        setIsNoticeRecorded(true);
      }
    });
  }

  return (
    <>
      <div className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-red-700">
                Active attention
              </span>
              <span className="font-headline text-sm font-semibold text-neutral-900">
                Renewable share below contract minimum ({supplierName})
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-neutral-600">
              {supplierName}'s renewable share was {formatPercent(analysis.renewableSharePercent)} in{" "}
              {record.period}, {analysis.shortfallPoints.toFixed(1)} percentage points below the
              contract minimum of {formatPercent(requirement.minRenewableSharePercent)} for "
              {contractName}". Fossil energy above the contractual limit:{" "}
              {formatKwh(analysis.fossilExcessKwh)}.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={() => openNotice(row)}
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
            Showing {(currentPage - 1) * ATTENTION_PAGE_SIZE + 1} of {rows.length} energy records
            requiring attention
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

      {noticeRow && selectedNoticeReason && (
        <NoticeReviewDialog
          contractName={noticeRow.contract?.contractName ?? "Unknown contract"}
          supplierName={noticeRow.contract?.supplierName ?? "Unknown supplier"}
          reason={selectedNoticeReason}
          message={noticeMessageDraft}
          onMessageChange={setNoticeMessageDraft}
          onCancel={closeNotice}
          onConfirm={confirmNotice}
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