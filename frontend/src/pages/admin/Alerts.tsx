import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, Clock3, Download, Loader2, Plus, Search } from "lucide-react";
import { useAlerts } from "../../hooks/useAlerts";
import { useFleet } from "../../hooks/useVehicles";
import { useSearchParams } from "react-router-dom";
import { useDashboardSummary, useUpdateAlertStatus, useUpdateManualAlert } from "../../hooks/useDashboardSummary";
import { createManualAlert, archiveAlert, restoreAlert } from "../../api/alerts";
import { addSupplierNote } from "../../api/notes";
import { useAuth } from "../../hooks/useAuth";
import { KpiCard } from "../../components/ui/KpiCard";
import { TablePagination } from "../../components/ui/TablePagination";
import { AlertsTable } from "../../components/alerts/AlertsTable";
import type { AlertRow } from "../../components/alerts/AlertsTable";
import { CreateManualAlertDialog } from "../../components/alerts/CreateManualAlertDialog";
import { AlertDetailsDrawer } from "../../components/alerts/AlertDetailsDrawer";
import { AlertsAttentionCard } from "../../components/alerts/AlertsAttentionCard";
import { ALERT_SEVERITY_LABELS, ALERT_STATUS_LABELS } from "../../components/alerts/AlertBadges";
import { ALERT_STATUSES } from "../../types/dashboard";
import type { AlertSeverity, AlertStatus, NewManualAlertInput, RecentAlert } from "../../types/dashboard";
import { getActiveCertificateContracts } from "../../utils/certificateContracts";
import type { AlertContract } from "../../components/alerts/AlertsTable";
import { formatAlertCreatedDate } from "../../utils/alertAge";
import { downloadCsv, toCsv } from "../../utils/csv";

type AlertView = "all" | AlertSeverity;
// "UNRESOLVED" is every status except RESOLVED, the same set the dashboard card counts.
type StatusFilter = "ALL" | "UNRESOLVED" | AlertStatus;

const FILTERS: { value: AlertView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1, low: 2 };
const PAGE_SIZE = 6; // same as the other overview pages; the logic doesn't assume how many rows exist
type PendingAlertDelete = { deadline: number; isDeleting: boolean };

export default function Alerts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const { data: alerts, isLoading: alertsLoading, isError: alertsError } = useAlerts(showArchived);
  // Agreement names are a convenience column: if the fleet data is unavailable the page still works without them.
  const fleet = useFleet();
  const contracts = useMemo(() => (fleet.data ? getActiveCertificateContracts(fleet.data) : []), [fleet.data]);
  // Only used for the portfolio-wide count shown next to the record-based KPIs.
  const { data: dashboard } = useDashboardSummary();
  const updateAlertStatus = useUpdateAlertStatus();
  const updateManualAlert = useUpdateManualAlert();
  const createAlert = useMutation({
    mutationFn: (input: NewManualAlertInput) => createManualAlert(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
  // Archive keeps the alert (it can be restored); there is no permanent delete here.
  const permanentDelete = useMutation({
    mutationFn: (id: string) => archiveAlert(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreAlert(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const [view, setView] = useState<AlertView>("all");
  // The status filter lives in the URL so dashboard links such as ?status=unresolved can set it.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status")?.toUpperCase();
  const statusFilter: StatusFilter =
    statusParam === "UNRESOLVED" ? "UNRESOLVED" : ALERT_STATUSES.find((candidate) => candidate === statusParam) ?? "ALL";
  const setStatusFilter = useCallback((next: StatusFilter) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (next === "ALL") params.delete("status");
      else params.set("status", next.toLowerCase());
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createdAlertIdToReveal, setCreatedAlertIdToReveal] = useState<string | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, PendingAlertDelete>>({});
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createSuccessMessage, setCreateSuccessMessage] = useState("");
  const [statusFeedback, setStatusFeedback] = useState<{
    alertId: string;
    message: string;
    isError: boolean;
  } | null>(null);
  const finalizingDeleteIds = useRef(new Set<string>());
  const finalizeDeleteAlert = useCallback(async (id: string) => {
    if (finalizingDeleteIds.current.has(id)) return;
    finalizingDeleteIds.current.add(id);
    setPendingDeletes((current) => {
      const pending = current[id];
      return pending ? { ...current, [id]: { ...pending, isDeleting: true } } : current;
    });
    try {
      await permanentDelete.mutateAsync(id);
      setPendingDeletes((current) => {
        const { [id]: _removed, ...remaining } = current;
        return remaining;
      });
    } catch (error) {
      setPendingDeletes((current) => {
        const { [id]: _removed, ...remaining } = current;
        return remaining;
      });
      setDeleteErrors((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : "Could not archive the alert.",
      }));
    } finally {
      finalizingDeleteIds.current.delete(id);
    }
  }, [permanentDelete]);

  // Most severe first; within a severity, the original order (most recent first) is kept.
  const rows = useMemo<AlertRow[]>(() => {
    if (!alerts) return [];
    const contractBySupplier = new Map<string, AlertContract>();
    const supplierById = new Map((dashboard?.topRiskSuppliers ?? []).map((supplier) => [supplier.id, supplier]));
    for (const c of contracts) {
      if (!contractBySupplier.has(c.supplierId)) contractBySupplier.set(c.supplierId, c);
    }
    return alerts
      .filter((alert) => !pendingDeletes[alert.id])
      .map((alert, index) => ({
        alert,
        contract: alert.supplierId ? contractBySupplier.get(alert.supplierId) : undefined,
        supplier: alert.supplierId ? supplierById.get(alert.supplierId) : undefined,
        index,
      }))
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity] || a.index - b.index
      )
      .map(({ alert, contract, supplier }) => ({ alert, contract, supplier }));
  }, [alerts, contracts, dashboard?.topRiskSuppliers, pendingDeletes]);

  const counts = useMemo(() => {
    const result: { unresolved: number; high: number; medium: number; low: number; resolved: number } = {
      unresolved: 0,
      high: 0,
      medium: 0,
      low: 0,
      resolved: 0,
    };
    for (const { alert } of rows) {
      if (alert.archivedAt) continue;
      if (alert.status === "RESOLVED") {
        result.resolved += 1;
      } else {
        result.unresolved += 1;
        result[alert.severity] += 1;
      }
    }
    return result;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter(({ alert }) => {
        const matchesStatus =
          statusFilter === "ALL" || (statusFilter === "UNRESOLVED" ? alert.status !== "RESOLVED" : alert.status === statusFilter);
        const matchesSeverity = view === "all" || alert.severity === view;
        return matchesStatus && matchesSeverity;
      })
      .filter(
        ({ alert, contract, supplier }) =>
          query.length === 0 ||
          [
            alert.title,
            alert.description,
            alert.reason ?? "",
            alert.affectedItem?.name ?? "",
            alert.findingType ?? "",
            contract?.supplierName ?? supplier?.displayName ?? "",
            contract?.supplierOrgId ?? supplier?.orgId ?? "",
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

  useEffect(() => {
    if (!createdAlertIdToReveal) return;
    const index = filteredRows.findIndex(({ alert }) => alert.id === createdAlertIdToReveal);
    if (index === -1) return;
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    setCreatedAlertIdToReveal(null);
  }, [createdAlertIdToReveal, filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const emptyMessage = rows.length === 0
    ? "No alert records available"
    : "No alerts match the current filters";

  if (alertsLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (alertsError || !alerts) {
    return <div className="text-sm text-red-700">Couldn't load alerts. Try again.</div>;
  }

  // The drawer reads from all rows so status changes do not close it.
  const selectedRow = rows.find((r) => r.alert.id === selectedId) ?? null;
  const attentionRows = rows.filter(
    (r) => r.alert.status !== "RESOLVED" && r.alert.severity === "high"
  );

  const portfolioUnresolved = dashboard?.kpis.activeAlerts;
  const statusFeedbackForSelected = selectedId === statusFeedback?.alertId ? statusFeedback : null;

  function handleStatusChange(id: string, status: AlertStatus) {
    setStatusFeedback(null);
    updateAlertStatus.mutate(
      { id, status },
      {
        onSuccess: () =>
          setStatusFeedback({
            alertId: id,
            message: `Status updated to ${ALERT_STATUS_LABELS[status]}.`,
            isError: false,
          }),
        onError: (error) =>
          setStatusFeedback({
            alertId: id,
            message: error instanceof Error ? error.message : "Could not update alert status",
            isError: true,
          }),
      }
    );
  }

  function handleDeleteAlert(row: AlertRow) {
    const id = row.alert.id;
    if (pendingDeletes[id] || finalizingDeleteIds.current.has(id)) return;
    setDeleteErrors((current) => {
      const { [id]: _removed, ...remaining } = current;
      return remaining;
    });
    setPendingDeletes((current) => ({
      ...current,
      [id]: { deadline: Date.now() + 5000, isDeleting: false },
    }));
  }

  function handleUndoDelete(id: string) {
    const pending = pendingDeletes[id];
    if (!pending || pending.isDeleting || Date.now() >= pending.deadline) return;
    setPendingDeletes((current) => {
      const { [id]: _removed, ...remaining } = current;
      return remaining;
    });
  }

  async function handleCreateAlert(input: NewManualAlertInput, noteToSelf?: string) {
    const createdAlert: RecentAlert = await createAlert.mutateAsync(input);
    // The alert is already saved: a failed note must not make the dialog report the whole thing as failed.
    let noteSaved = true;
    if (noteToSelf) {
      try {
        await addSupplierNote(input.supplierId, { id: user?.id ?? "", name: user?.name ?? "Unknown admin" }, {
          text: noteToSelf,
          visibility: "SELF",
          alertId: createdAlert.id,
        });
        await queryClient.invalidateQueries({ queryKey: ["supplier-notes", input.supplierId] });
      } catch {
        noteSaved = false;
      }
    }
    setView("all");
    setStatusFilter("ALL");
    setSearch("");
    setPage(1);
    setCreatedAlertIdToReveal(createdAlert.id);
    setCreateSuccessMessage(
      noteSaved ? "Manual alert created successfully" : "Alert saved, note not saved. Add the note from the supplier's page."
    );
  }

  function handleExport() {
    if (filteredRows.length === 0) return;
    const csv = toCsv(
      filteredRows.map(({ alert, contract, supplier }) => ({
        Risk: ALERT_SEVERITY_LABELS[alert.severity],
        "Created On": alert.createdAt ? formatAlertCreatedDate(alert.createdAt) : "",
        Description: alert.description,
        Finding: alert.findingType ?? "",
        "Affected item": alert.affectedItem?.name ?? "",
        Reason: alert.reason ?? "",
        Alert: alert.title,
        Supplier: contract?.supplierName ?? supplier?.displayName ?? "",
        "Org ID": contract?.supplierOrgId ?? supplier?.orgId ?? "",
        Contract: contract?.contractName ?? supplier?.primaryContract ?? "",
        Status: ALERT_STATUS_LABELS[alert.status],
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
              Compliance workflow alerts across monitored suppliers, tracked from open through resolution.
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
              onClick={() => {
                setCreateSuccessMessage("");
                setIsCreateDialogOpen(true);
              }}
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
          label="Unresolved alerts"
          value={counts.unresolved}
          sublabel="with full records"
          note={
            portfolioUnresolved !== undefined
              ? `${portfolioUnresolved} portfolio-wide (Dashboard)`
              : counts.unresolved > 0
                ? "Unresolved records currently visible"
                : "No unresolved records"
          }
          icon={<Bell className="h-4 w-4" />}
          iconClassName="bg-primary-100 text-primary-900"
        />
        <KpiCard
          label="High Risk"
          value={counts.high}
          sublabel="unresolved follow-up"
          note={counts.high > 0 ? "Needs immediate attention" : "None currently"}
          noteTone={counts.high > 0 ? "danger" : "success"}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-red-100 text-red-700"
        />
        <KpiCard
          label="Medium Risk"
          value={counts.medium}
          sublabel="unresolved follow-up"
          note={counts.medium > 0 ? "Needs follow-up soon" : "None currently"}
          icon={<Clock3 className="h-4 w-4" />}
          iconClassName="bg-amber-100 text-amber-700"
        />
        <KpiCard
          label="Resolved"
          value={counts.resolved}
          sublabel="with full records"
          note={counts.resolved > 0 ? "No further action currently required" : "No resolved alerts"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconClassName="bg-tertiary-100 text-tertiary-700"
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
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              <span className="font-medium text-neutral-700">Show archived</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Status:</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "ALL" || value === "UNRESOLVED") {
                    setStatusFilter(value);
                  } else {
                    const status = ALERT_STATUSES.find((candidate) => candidate === value);
                    if (status) setStatusFilter(status);
                  }
                }}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                aria-label="Filter alerts by status"
              >
                <option value="ALL">All statuses</option>
                <option value="UNRESOLVED">Unresolved</option>
                {ALERT_STATUSES.map((status) => (
                  <option key={status} value={status}>{ALERT_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Risk:</span>
              <span className="relative inline-flex">
                <select
                  value={view}
                  onChange={(event) => setView(event.target.value as AlertView)}
                  className="appearance-none rounded-md border border-neutral-200 bg-white py-1 pl-2 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                  aria-label="Filter alerts by risk"
                >
                  {FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.value === "all" ? "All" : filter.label}
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
          onArchive={handleDeleteAlert}
          onRestore={(row) => restore.mutate(row.alert.id)}
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

      {/* Highlight unresolved high-risk alerts, regardless of the table filters above. */}
      <AlertsAttentionCard rows={attentionRows} onViewDetails={(row) => setSelectedId(row.alert.id)} />

      <AlertDetailsDrawer
        row={selectedRow}
        onClose={() => setSelectedId(null)}
        onStatusChange={handleStatusChange}
        onEdit={async (id, changes) => { await updateManualAlert.mutateAsync({ id, changes }); }}
        isBusy={updateAlertStatus.isPending}
        statusMessage={statusFeedbackForSelected?.message}
        statusError={statusFeedbackForSelected?.isError}
      />

      {createSuccessMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card"
        >
          {createSuccessMessage}
          <button
            type="button"
            aria-label="Dismiss success message"
            onClick={() => setCreateSuccessMessage("")}
            className="ml-3 font-semibold text-tertiary-300 hover:text-tertiary-200"
          >
            ×
          </button>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {Object.entries(pendingDeletes).map(([id, pending]) => {
          const alertTitle = alerts.find((alert) => alert.id === id)?.title ?? "Alert";
          return (
            <AlertDeleteUndoNotice
              key={id}
              title={alertTitle}
              deadline={pending.deadline}
              isDeleting={pending.isDeleting}
              onUndo={() => handleUndoDelete(id)}
              onExpire={() => void finalizeDeleteAlert(id)}
            />
          );
        })}
        {Object.entries(deleteErrors).map(([id, message]) => (
          <div
            key={id}
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg bg-red-700 px-4 py-3 text-sm text-white shadow-card"
          >
            <span>{message}</span>
            <button
              type="button"
              aria-label="Dismiss delete error"
              onClick={() =>
                setDeleteErrors((current) => {
                  const { [id]: _removed, ...remaining } = current;
                  return remaining;
                })
              }
              className="font-semibold text-white/80 hover:text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <CreateManualAlertDialog
        open={isCreateDialogOpen}
        suppliers={dashboard?.topRiskSuppliers ?? []}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateAlert}
      />
    </div>
  );
}

function AlertDeleteUndoNotice({
  title,
  deadline,
  isDeleting,
  onUndo,
  onExpire,
}: {
  title: string;
  deadline: number;
  isDeleting: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(
    () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  );
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expirationHandled = useRef(false);

  useEffect(() => {
    if (isDeleting) return;
    return startAlertDeleteCountdown(deadline, setSecondsRemaining, () => {
      if (expirationHandled.current) return;
      expirationHandled.current = true;
      onExpireRef.current();
    });
  }, [deadline, isDeleting]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card"
    >
      <span className="min-w-0 truncate">
        {isDeleting ? "Archiving alert…" : `Alert archived: ${title}`}
      </span>
      {isDeleting ? (
        <span className="shrink-0 text-neutral-300">Please wait</span>
      ) : (
        <button
          type="button"
          onClick={onUndo}
          disabled={secondsRemaining === 0}
          className="shrink-0 font-semibold text-tertiary-300 hover:text-tertiary-200 disabled:opacity-50"
        >
          Undo ({secondsRemaining}s)
        </button>
      )}
    </div>
  );
}

export function startAlertDeleteCountdown(
  deadline: number,
  onTick: (secondsRemaining: number) => void,
  onExpire: () => void
): () => void {
  let expirationHandled = false;
  const intervalId = globalThis.setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    onTick(remaining);
    if (remaining === 0 && !expirationHandled) {
      expirationHandled = true;
      globalThis.clearInterval(intervalId);
      onExpire();
    }
  }, 100);
  return () => globalThis.clearInterval(intervalId);
}