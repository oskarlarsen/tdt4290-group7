import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Clock3,
  Download,
  Loader2,
  Play,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useRiskOutlook } from "../../hooks/useRiskOutlook";
import { KpiCard } from "../../components/ui/KpiCard";
import { NotConnectedDialog } from "../../components/ui/NotConnectedDialog";
import { TablePagination } from "../../components/ui/TablePagination";
import { RiskOutlookTable } from "../../components/risk/RiskOutlookTable";
import { RiskDetailsDrawer } from "../../components/risk/RiskDetailsDrawer";
import { RiskAttentionCard } from "../../components/risk/RiskAttentionCard";
import { CERTIFICATE_THRESHOLDS } from "../../types/certificate";
import {
  RISK_PRIORITY_INFO,
  formatDaysValue,
  summarizeRiskOutlook,
} from "../../types/riskOutlook";
import type { RiskOutlookRow, RiskPriority } from "../../types/riskOutlook";
import { downloadCsv, toCsv } from "../../utils/csv";

type PriorityFilter = "all" | RiskPriority;

const PAGE_SIZE = 6; // same as the reference; the logic doesn't assume how many rows exist
const EMPTY_ROWS: RiskOutlookRow[] = [];

export default function RiskAndPrediction() {
  const { rows, isLoading, isError } = useRiskOutlook();
  const allRows = rows ?? EMPTY_ROWS;

  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRunInfoOpen, setIsRunInfoOpen] = useState(false);

  const summary = useMemo(() => summarizeRiskOutlook(allRows), [allRows]);
  const counts: Record<PriorityFilter, number> = { all: summary.total, ...summary.counts };

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows
      .filter((row) => priorityFilter === "all" || row.priority === priorityFilter)
      .filter((row) => {
        if (query.length === 0) return true;
        const haystack = [
          row.contract.supplierName,
          row.contract.supplierOrgId,
          row.contract.contractName,
          ...row.indicators.flatMap((i) => [i.title, i.detail]),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
  }, [allRows, priorityFilter, search]);

  // Back to page 1 when the result set changes shape.
  useEffect(() => {
    setPage(1);
  }, [priorityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !rows) {
    return <div className="text-sm text-red-700">Couldn't load the risk outlook. Try again.</div>;
  }

  const selectedRow = allRows.find((r) => r.contract.id === selectedId) ?? null;
  const { earliest } = summary;

  function handleExport() {
    if (filteredRows.length === 0) return;
    const csv = toCsv(
      filteredRows.map((row) => ({
        Supplier: row.contract.supplierName,
        "Org ID": row.contract.supplierOrgId,
        Contract: row.contract.contractName,
        "Risk priority": RISK_PRIORITY_INFO[row.priority].label,
        "Primary risk driver": row.primary?.title ?? "",
        "Driver detail": row.primary?.detail ?? "",
        Indicators: row.indicators.length,
        "Next projected breach": row.nextProjected?.date ?? "",
        "Days until": row.nextProjected?.daysUntil ?? "",
      }))
    );
    downloadCsv(`risk-outlook-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Risk &amp; Breach Prediction
            </h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-6 text-[#5c6773]">
              Early-warning overview of active deviations and upcoming certificate lapses across
              contracted suppliers, ranked by the customer's risk priority order.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <button
              onClick={handleExport}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export (CSV)
            </button>
            <button
              onClick={() => setIsRunInfoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              <Play className="h-3.5 w-3.5" />
              Run prediction check
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="High-priority contracts"
          value={counts.high}
          valueClassName="!text-xl"
          note={counts.high > 0 ? "Vehicle deviations or energy breaches" : "None currently"}
          noteTone={counts.high > 0 ? "danger" : "success"}
          inlineNote
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-rose-100 text-red-700"
        />
        <KpiCard
          label="Medium-priority contracts"
          value={counts.medium}
          valueClassName="!text-xl"
          note={counts.medium > 0 ? "Expired certificates, minor deviations, missing data" : "None currently"}
          inlineNote
          icon={<ShieldAlert className="h-4 w-4" />}
          iconClassName="bg-amber-100 text-amber-700"
        />
        <KpiCard
          label="Contracts with upcoming certificate lapses"
          value={summary.predictedContracts}
          valueClassName="!text-xl"
          note={`${summary.predictedIndicators} certificate${summary.predictedIndicators === 1 ? "" : "s"} expiring within ${CERTIFICATE_THRESHOLDS.yellowDays} days`}
          inlineNote
          icon={<Clock3 className="h-4 w-4" />}
          iconClassName="bg-amber-100 text-orange-700"
        />
        <KpiCard
          label="Earliest upcoming certificate lapse"
          value={earliest && earliest.indicator.daysUntil !== null ? formatDaysValue(earliest.indicator.daysUntil) : "—"}
          valueClassName="!text-xl"
          note={
            earliest
              ? `${earliest.row.contract.supplierName} · ${earliest.indicator.title}`
              : "No upcoming expiries"
          }
          inlineNote
          icon={<CalendarClock className="h-4 w-4" />}
          iconClassName="bg-violet-100 text-primary-900"
        />
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier, contract, or risk driver…"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-500 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">Risk priority:</span>
            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
                aria-label="Filter risk outlook by priority"
                className="appearance-none rounded-md border border-neutral-200 bg-white px-2 py-1 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              >
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none">No indicators</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            </div>
          </label>
        </div>

        <RiskOutlookTable
          rows={pagedRows}
          onSelect={(row) => setSelectedId(row.contract.id)}
          emptyMessage={
            allRows.length === 0 ? "No contracts available." : "No contracts match the current filters."
          }
        />

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          pageSize={PAGE_SIZE}
          itemLabel="contract"
          onPageChange={setPage}
        />
      </section>

      {/* Portfolio-wide highlight, regardless of the filters above. */}
      <RiskAttentionCard rows={allRows} onViewDetails={(row) => setSelectedId(row.contract.id)} />

      <RiskDetailsDrawer row={selectedRow} onClose={() => setSelectedId(null)} />

      <NotConnectedDialog
        open={isRunInfoOpen}
        title="Run prediction check"
        message="Running a prediction check isn't available yet. The indicators on this page are calculated live in your browser from the fictional vehicle, certificate and energy records. There is no prediction model, historical dataset or backend job to run."
        onClose={() => setIsRunInfoOpen(false)}
      />
    </div>
  );
}