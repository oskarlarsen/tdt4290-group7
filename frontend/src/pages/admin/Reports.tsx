import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { useReportSources } from "../../hooks/useReportSources";
import { useReportHistory } from "../../hooks/useReportHistory";
import { KpiCard } from "../../components/ui/KpiCard";
import { NotConnectedDialog } from "../../components/ui/NotConnectedDialog";
import { TablePagination } from "../../components/ui/TablePagination";
import { ReportsTable } from "../../components/reports/ReportsTable";
import type { ReportItem } from "../../components/reports/ReportsTable";
import { ReportDetailsDrawer } from "../../components/reports/ReportDetailsDrawer";
import { ReportsAttentionCard } from "../../components/reports/ReportsAttentionCard";
import { REPORT_CATEGORY_LABELS, REPORT_DEFINITIONS } from "../../types/report";
import type { ReportCategory, ReportId, ReportStatus } from "../../types/report";
import { buildReportRows } from "../../utils/reportBuilders";
import { downloadCsv, toCsv } from "../../utils/csv";

type CategoryFilter = "all" | ReportCategory;
type StatusFilter = "all" | ReportStatus;

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "suppliers-contracts", label: REPORT_CATEGORY_LABELS["suppliers-contracts"] },
  { value: "monitoring", label: REPORT_CATEGORY_LABELS.monitoring },
  { value: "risk-alerts", label: REPORT_CATEGORY_LABELS["risk-alerts"] },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "drafting", label: "Drafting" },
  { value: "published", label: "Published" },
  { value: "under-review", label: "Under Review" },
  { value: "scheduled", label: "Scheduled" },
];

const PAGE_SIZE = 6; // same as the other overview pages; the logic doesn't assume how many rows exist

function getReportingPeriod(rows: ReportItem["rows"]): string | null {
  const periods = Array.from(
    new Set(
      rows
        .map((row) => row.Period)
        .filter((period): period is string => typeof period === "string" && period.length > 0)
    )
  );
  return periods.length > 0 ? periods.join(" · ") : null;
}

export default function Reports() {
  const { sources, isLoading, isError } = useReportSources();
  const history = useReportHistory();

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<ReportId | null>(null);
  const [dialog, setDialog] = useState<"schedule" | "custom" | null>(null);

  // Rows are built once per data change; every report is generated from the records
  // the other pages already show.
  const built = useMemo(
    () =>
      sources
        ? REPORT_DEFINITIONS.map((definition) => ({
            definition,
            rows: buildReportRows(definition.id, sources),
          }))
        : [],
    [sources]
  );

  const items = built.map(
    ({ definition, rows }): ReportItem => ({
      definition,
      rows,
      status: definition.status,
      lastGeneratedAt: history.lastGeneratedAt(definition.id),
      reportingPeriod: getReportingPeriod(rows),
      generatedDueAt: definition.generatedDueAt ?? null,
    })
  );
  const highPriorityRows = useMemo(
    () => sources?.riskOutlook.filter((row) => row.priority === "high") ?? [],
    [sources?.riskOutlook]
  );

  // Reports with records first; catalog order is kept within each group.
  const ordered = [...items].sort(
    (a, b) => Number(b.rows.length > 0) - Number(a.rows.length > 0)
  );

  const query = search.trim().toLowerCase();
  const filteredItems = ordered
    .filter((item) => category === "all" || item.definition.category === category)
    .filter((item) => statusFilter === "all" || item.status === statusFilter)
    .filter(
      (item) =>
        query.length === 0 ||
        [
          item.definition.title,
          item.definition.description,
          item.definition.sourceLabel,
          REPORT_CATEGORY_LABELS[item.definition.category],
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
    );

  // Back to page 1 whenever the filters change, so a narrower result never strands you
  // on an empty page.
  useEffect(() => {
    setPage(1);
  }, [category, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !sources) {
    return <div className="text-sm text-red-700">Couldn't load report data. Try again.</div>;
  }

  function handleGenerate(reportId: ReportId) {
    const item = items.find((i) => i.definition.id === reportId);
    if (!item || item.rows.length === 0) return;
    downloadCsv(`${reportId}-report-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(item.rows));
    history.record(reportId);
  }

  // Every KPI is calculated from the loaded data or the download history.
  const availableCount = items.filter((i) => i.rows.length > 0).length;
  const noDataCount = items.length - availableCount;
  const latestTitle = history.latest
    ? REPORT_DEFINITIONS.find((d) => d.id === history.latest?.reportId)?.title
    : undefined;
  const latestDate = history.latest ? new Date(history.latest.at) : null;
  const lastDownloadValue = latestDate
    ? latestDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "—";
  const lastDownloadNote = latestDate
    ? `${latestDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${latestTitle ? ` · ${latestTitle}` : ""}`
    : "No download recorded in this browser";
  const selectedItem = items.find((i) => i.definition.id === selectedId) ?? null;

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              Compliance / Reports
            </div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Compliance Reports
            </h1>
            <p className="mt-1.5 max-w-170 text-sm leading-6 text-[#5c6773]">
              Downloadable summaries of supplier, contract, vehicle, certificate, energy, risk and
              alert data, generated from the current records.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => setDialog("schedule")}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Schedule Automated Report
            </button>
            <button
              onClick={() => setDialog("custom")}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-900 px-3 text-xs font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Generate Custom Report
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Reports available"
          value={availableCount}
          sublabel={`of ${items.length} report types`}
          icon={<FileText className="h-4 w-4" />}
          iconClassName="bg-primary-100 text-primary-900"
        />
        <KpiCard
          label="Generated this month"
          value={history.generatedThisMonth}
          note="Counted from downloads in this browser"
          icon={<Download className="h-4 w-4" />}
          iconClassName="bg-tertiary-100 text-tertiary-700"
        />
        <KpiCard
          label="Latest report download"
          value={lastDownloadValue}
          note={lastDownloadNote}
          icon={<Clock3 className="h-4 w-4" />}
          iconClassName="bg-violet-100 text-violet-700"
        />
        <KpiCard
          label="Reports without data"
          value={noDataCount}
          note={noDataCount > 0 ? "No records to include" : "All report types have data"}
          noteTone={noDataCount > 0 ? "danger" : "success"}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-red-100 text-red-700"
        />
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search report title, category, or data source…"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Category:</span>
              <div className="relative">
                <select
                  aria-label="Filter reports by category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as CategoryFilter)}
                  className="appearance-none rounded-md border border-neutral-200 bg-white py-1 pl-2 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                >
                  {CATEGORY_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
              </div>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Status:</span>
              <div className="relative">
                <select
                  aria-label="Filter reports by status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className="appearance-none rounded-md border border-neutral-200 bg-white py-1 pl-2 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
              </div>
            </label>
          </div>
        </div>

        <>
          <ReportsTable
            items={pagedItems}
            onSelect={(item) => setSelectedId(item.definition.id)}
            onGenerate={handleGenerate}
            emptyMessage="No reports match the current filters."
          />

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredItems.length}
            pageSize={PAGE_SIZE}
            itemLabel="report"
            onPageChange={setPage}
          />
        </>
      </section>

      <ReportsAttentionCard
        highPriorityRows={highPriorityRows}
        onDownload={() => handleGenerate("risk-outlook")}
      />

      <ReportDetailsDrawer
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onGenerate={handleGenerate}
      />

      <NotConnectedDialog
        open={dialog === "schedule"}
        title="Schedule automated report"
        message="Scheduled report delivery isn't available yet. Reports can be downloaded on demand from the table. Scheduling needs a backend job and a delivery channel such as e-mail, neither of which exists."
        onClose={() => setDialog(null)}
      />
      <NotConnectedDialog
        open={dialog === "custom"}
        title="Generate custom report"
        message="Custom reports aren't available yet. The reports in the table are fixed summaries of the current mock data. Choosing your own fields, filters and period needs a backend reporting service."
        onClose={() => setDialog(null)}
      />
    </div>
  );
}