import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { NoticeReviewDialog } from "../ui/NoticeReviewDialog";
import { useSendSupplierNotice } from "../../hooks/useSupplierNotices";
import type { AlertRow } from "./AlertsTable";
import { formatAlertCreatedDate } from "../../utils/alertAge";

export function AlertsAttentionCard({
  rows,
  onViewDetails,
}: {
  rows: AlertRow[];
  onViewDetails: (row: AlertRow) => void;
}) {
  const [noticeRow, setNoticeRow] = useState<AlertRow | null>(null);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [isNoticeRecorded, setIsNoticeRecorded] = useState(false);
  const [page, setPage] = useState(1);

  const sendNotice = useSendSupplierNotice(noticeRow?.alert.supplierId ?? null);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  useEffect(() => {
    if (!isNoticeRecorded) return;
    const timeout = window.setTimeout(() => setIsNoticeRecorded(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [isNoticeRecorded]);

  if (rows.length === 0) return null;

  const totalPages = rows.length;
  const currentPage = Math.min(page, totalPages);
  const visibleRow = rows[currentPage - 1];
  const { alert, contract } = visibleRow;
  const supplierName = contract?.supplierName ?? visibleRow.supplier?.displayName ?? "Unknown supplier";

  function openNotice(row: AlertRow) {
    const rowSupplier = row.contract?.supplierName ?? row.supplier?.displayName ?? "Unknown supplier";
    const rowContract = row.contract?.contractName ?? row.supplier?.primaryContract ?? "No linked contract";
    setNoticeMessage(
      `This demo notice concerns ${row.alert.title}. Supplier: ${rowSupplier}. Contract: ${rowContract}. Reason: ${row.alert.description}`
    );
    setNoticeRow(row);
  }

  function closeNotice() {
    setNoticeRow(null);
    setNoticeMessage("");
  }

  function recordNotice() {
    if (!noticeRow) return;
    sendNotice.mutate({
      title: noticeRow.alert.title,
      message: noticeMessage,
    }, {
      onSuccess: () => {
        closeNotice();
        setIsNoticeRecorded(true);
      }
    });
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-neutral-100 bg-white">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-red-700">
                Needs attention
              </span>
              <span className="font-headline text-sm font-semibold text-neutral-900">
                High-risk alert · {supplierName}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              {alert.title}: {alert.description}
              {contract ? ` Linked contract: ${contract.contractName}.` : ""} Created on {formatAlertCreatedDate(alert.createdAt)}.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={() => openNotice(visibleRow)}
              className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-red-700 px-3 text-xs font-medium text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700/30"
            >
              <Mail className="h-3.5 w-3.5" />
              Send notice
            </button>
            <button
              onClick={() => onViewDetails(visibleRow)}
              className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              View details
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-4 py-3">
          <p className="text-xs text-neutral-500">
            Showing {currentPage} of {rows.length} alert{rows.length === 1 ? "" : "s"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="whitespace-nowrap font-mono text-xs text-neutral-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {noticeRow && (
        <NoticeReviewDialog
          contractName={noticeRow.contract?.contractName ?? "No linked contract"}
          supplierName={noticeRow.contract?.supplierName ?? "Unknown supplier"}
          reason={`${noticeRow.alert.title}: ${noticeRow.alert.description}`}
          message={noticeMessage}
          onMessageChange={setNoticeMessage}
          onCancel={closeNotice}
          onConfirm={recordNotice}
          showDemoNote
          wrapReason
        />
      )}

      {isNoticeRecorded && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card"
        >
          Notice recorded for demo only; no email was sent.
        </div>
      )}
    </>
  );
}