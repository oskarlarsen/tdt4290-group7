import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, ChevronDown, Clock3, Download, EyeOff, Loader2, Plus, Search } from "lucide-react";
import { useAlerts } from "../../hooks/useAlerts";
import { useAuth } from "../../hooks/useAuth";
import { useContracts } from "../../hooks/useContracts";
import { useDashboardSummary, useDismissAlert, useRestoreAlert } from "../../hooks/useDashboardSummary";
import { KpiCard } from "../../components/ui/KpiCard";
import { NotConnectedDialog } from "../../components/ui/NotConnectedDialog";
import { TablePagination } from "../../components/ui/TablePagination";
import { AlertsTable } from "../../components/alerts/AlertsTable";
import type { AlertRow } from "../../components/alerts/AlertsTable";
import { AlertDetailsDrawer } from "../../components/alerts/AlertDetailsDrawer";
import { AlertsAttentionCard } from "../../components/alerts/AlertsAttentionCard";
import { ALERT_SEVERITY_LABELS, ALERT_STATUS_LABELS } from "../../components/alerts/AlertBadges";
import type { AlertSeverity, AlertStatus } from "../../types/dashboard";
import type { DerivedContract } from "../../types/contract";
import { downloadCsv, toCsv } from "../../utils/csv";

type AlertView = "all" | AlertSeverity;

const FILTERS: { value: AlertView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
];

const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1 };
const PAGE_SIZE = 6; // same as the other overview pages; the logic doesn't assume how many rows exist

export default function Alerts() {
  const { user } = useAuth();
  const { data: alerts, isLoading: alertsLoading, isError: alertsError } = useAlerts();
  const { data: contracts, isLoading: contractsLoading, isError: contractsError } = useContracts();
  // Only used for the portfolio-wide count shown next to the record-based KPIs.
  const { data: dashboard } = useDashboardSummary();
  const dismissAlert = useDismissAlert();
  const restoreAlert = useRestoreAlert();

  const [view, setView] = useState<AlertView>("all");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AlertStatus>("ACTIVE");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateInfoOpen, setIsCreateInfoOpen] = useState(false);

  // Most severe first; within a severity, the original order (most recent first) is kept.
  const rows = useMemo<AlertRow[]>(() => {
    if (!alerts || !contracts) return [];
    const contractBySupplier = new Map<string, DerivedContract>();
    for (const c of contracts) {
      if (!contractBySupplier.has(c.supplierId)) contractBySupplier.set(c.supplierId, c);
    }
    return alerts
      .map((alert, index) => ({
        alert,
        contract: alert.supplierId ? contractBySupplier.get(alert.supplierId) : undefined,
        index,
      }))
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity] || a.index - b.index
      )
      .map(({ alert, contract }) => ({ alert, contract }));
  }, [alerts, contracts]);

  const counts = useMemo(() => {
    const result: { active: number; high: number; medium: number; dismissed: number } = {
      active: 0,
      high: 0,
      medium: 0,
      dismissed: 0,
    };
    for (const { alert } of rows) {
      if (alert.status === "DISMISSED") {
        result.dismissed += 1;
      } else {
        result.active += 1;
        result[alert.severity] += 1;
      }
    }
    return result;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter(({ alert }) => {
        const matchesStatus = statusFilter === "ALL" || alert.status === statusFilter;
        const matchesSeverity = view === "all" || alert.severity === view;
        return matchesStatus && matchesSeverity;
      })
      .filter(
        ({ alert, contract }) =>
          query.length === 0 ||
          [
            alert.title,
            alert.description,
            contract?.supplierName ?? "",
            contract?.supplierOrgId ?? "",
            contract?.contractName ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(query)
      );
  }, [rows, view, statusFilter, search]);

  // Back to page 1 when the result set changes shape.
  useEffect(() => {
    setPage(1);
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const emptyMessage =
    rows.length === 0
      ? "No alert records available."
      : statusFilter === "DISMISSED" && view === "all" && search.trim() === ""
        ? "No dismissed alerts."
        : "No alerts match the current filters.";

  if (alertsLoading || contractsLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (alertsError || contractsError || !alerts || !contracts) {
    return <div className="text-sm text-red-700">Couldn't load alerts. Try again.</div>;
  }

  // The drawer reads from ALL rows, so it stays open (now showing "Dismissed") after a dismiss.
  const selectedRow = rows.find((r) => r.alert.id === selectedId) ?? null;
  const attentionRows = rows.filter(
    (r) => r.alert.status === "ACTIVE" && r.alert.severity === "high"
  );

  const portfolioActive = dashboard?.kpis.activeAlerts;
  const isBusy = dismissAlert.isPending || restoreAlert.isPending;

  function handleExport() {
    if (filteredRows.length === 0) return;
    const csv = toCsv(
      filteredRows.map(({ alert, contract }) => ({
        Severity: ALERT_SEVERITY_LABELS[alert.severity],
        Raised: alert.timeAgo,
        Alert: alert.title,
        Description: alert.description,
        Supplier: contract?.supplierName ?? "",
        "Org ID": contract?.supplierOrgId ?? "",
        Contract: contract?.contractName ?? "",
        Status: ALERT_STATUS_LABELS[alert.status],
        "Dismissed by": alert.dismissedBy ?? "",
        "Dismissed at": alert.dismissedAt ?? "",
      }))
    );
    downloadCsv(`alerts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              Compliance / Alerts
            </div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Compliance Alerts
            </h1>
            <p className="mt-1.5 max-w-170 text-sm leading-6 text-[#5c6773]">
              Active compliance alerts across monitored suppliers, with the option to dismiss and
              restore them.
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
              onClick={() => setIsCreateInfoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Manual Alert
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active alerts"
          value={counts.active}
          sublabel="with full records"
          note={
            portfolioActive !== undefined
              ? `${portfolioActive} portfolio-wide (Dashboard)`
              : counts.active > 0
                ? "Active records currently visible"
                : "No active records"
          }
          icon={<Bell className="h-4 w-4" />}
          iconClassName="bg-primary-100 text-primary-900"
        />
        <KpiCard
          label="High severity"
          value={counts.high}
          sublabel="active follow-up"
          note={counts.high > 0 ? "Needs immediate attention" : "None currently"}
          noteTone={counts.high > 0 ? "danger" : "success"}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-red-100 text-red-700"
        />
        <KpiCard
          label="Medium severity"
          value={counts.medium}
          sublabel="active follow-up"
          note={counts.medium > 0 ? "Needs follow-up soon" : "None currently"}
          icon={<Clock3 className="h-4 w-4" />}
          iconClassName="bg-amber-100 text-amber-700"
        />
        <KpiCard
          label="Dismissed"
          value={counts.dismissed}
          sublabel="hidden from view"
          note={counts.dismissed > 0 ? "Not resolved, only dismissed" : "No dismissed alerts"}
          icon={<EyeOff className="h-4 w-4" />}
          iconClassName="bg-violet-100 text-violet-700"
        />
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alert, supplier, or contract…"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Status:</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | AlertStatus)}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                aria-label="Filter alerts by status"
              >
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Severity &amp; time:</span>
              <span className="relative inline-flex">
                <select
                  value={view}
                  onChange={(event) => setView(event.target.value as AlertView)}
                  className="appearance-none rounded-md border border-neutral-200 bg-white py-1 pl-2 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                  aria-label="Filter alerts by severity"
                >
                  {FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.value === "all" ? "All" : `${filter.label} severity`}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
                />
              </span>
            </label>
          </div>
        </div>

        <AlertsTable
          rows={pagedRows}
          onSelect={(row) => setSelectedId(row.alert.id)}
          emptyMessage={emptyMessage}
        />

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          pageSize={PAGE_SIZE}
          itemLabel="alert"
          onPageChange={setPage}
        />
      </section>

      {/* Highlight high-severity active alerts, regardless of the table filters above. */}
      <AlertsAttentionCard rows={attentionRows} onViewDetails={(row) => setSelectedId(row.alert.id)} />

      <AlertDetailsDrawer
        row={selectedRow}
        onClose={() => setSelectedId(null)}
        onDismiss={(id) => dismissAlert.mutate({ id, dismissedBy: user?.email ?? "unknown" })}
        onRestore={(id) => restoreAlert.mutate(id)}
        isBusy={isBusy}
      />

      <NotConnectedDialog
        open={isCreateInfoOpen}
        title="Create manual alert"
        message="Creating alerts manually isn't available yet. Alert records are currently fictional mock data. Real alerts would be generated by the backend when a deviation is detected."
        onClose={() => setIsCreateInfoOpen(false)}
      />
    </div>
  );
}