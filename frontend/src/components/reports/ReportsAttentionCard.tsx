import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { RiskOutlookRow } from "../../types/riskOutlook";

export function ReportsAttentionCard({
  highPriorityRows,
  onDownload,
}: {
  highPriorityRows: RiskOutlookRow[];
  onDownload: () => void;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [highPriorityRows]);

  if (highPriorityRows.length === 0) return null;

  const count = highPriorityRows.length;
  const currentPage = Math.min(page, count);
  const row = highPriorityRows[currentPage - 1];
  const detail =
    row.primary?.detail ??
    row.indicators.map((indicator) => indicator.detail).filter(Boolean).join(" ");

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-100 bg-white">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-red-700">
              Active attention
            </span>
            <span className="font-headline text-sm font-semibold text-neutral-900">
              High-priority contract · {row.contract.supplierName}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            {row.contract.contractName}: {detail}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            onClick={() => navigate("/admin/risk")}
            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-red-700 px-3 text-xs font-medium text-white transition-colors hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700/30"
          >
            View Risk Page
          </button>
          <button
            onClick={onDownload}
            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-900 px-3 text-xs font-medium text-white hover:bg-primary-700"
          >
            <Download className="h-3.5 w-3.5" />
            Download Risk Outlook (CSV)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 px-4 py-3">
        <p className="text-xs text-neutral-500">
          Showing {currentPage} of {count} high-priority contract{count === 1 ? "" : "s"}
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
          <span className="whitespace-nowrap font-mono text-xs text-neutral-400">
            Page {currentPage} of {count}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(count, current + 1))}
            disabled={currentPage >= count}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}