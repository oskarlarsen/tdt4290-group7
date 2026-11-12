import { ChevronLeft, ChevronRight } from "lucide-react";

// Norwegian plural of the singular label: avtale -> avtaler, leverandør -> leverandører, kjøretøy unchanged.
function plural(label: string): string {
  if (label.endsWith("y")) return label;
  return label.endsWith("e") ? `${label}r` : `${label}er`;
}

export function TablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  itemLabel,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  itemLabel: string; // singular, e.g. "avtale"
  onPageChange: (page: number) => void;
}) {
  const pageStart = (currentPage - 1) * pageSize;
  const summary =
    totalItems === 0
      ? `Ingen ${plural(itemLabel)} samsvarer med filtrene`
      : `Viser ${pageStart + 1}–${Math.min(pageStart + pageSize, totalItems)} av ${totalItems} ${totalItems === 1 ? itemLabel : plural(itemLabel)}`;

  return (
    <div className="-mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
      <p className="text-xs text-neutral-500">{summary}</p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Forrige
        </button>
        <span className="whitespace-nowrap font-mono text-xs text-neutral-500">
          Side {currentPage} av {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Neste
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}