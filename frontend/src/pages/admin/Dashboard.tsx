import { useSupplierReviewStatus } from "../../hooks/useSupplierReviewStatus";
import { useNavigate } from "react-router-dom";
import { Users, ShieldAlert, Bell, CheckCircle2, Loader2, Download, RefreshCw } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useDashboardSummary, useDismissAlert, useRestoreAlert, useResyncDashboard, } from "../../hooks/useDashboardSummary";
import { formatSyncTime } from "../../utils/formatSyncTime";
import { KpiCard } from "../../components/ui/KpiCard";
import { DashboardExportButton, QuickActions } from "../../components/ui/QuickActions";
import { RiskClassificationBar } from "../../components/risk/RiskClassificationBar";
import { IssueCategoryPanel } from "../../components/risk/IssueCategoryPanel";
import { TopRiskSuppliersTable } from "../../components/suppliers/TopRiskSuppliersTable";
import { AlertCard } from "../../components/alerts/AlertCard";
import { useEffect, useRef, useState } from "react";
import { sendEmailNotification } from "../../services/notificationService";
import { getRiskLogRows } from "../../api/dashboard";
import { toCsv, downloadCsv } from "../../utils/csv";

export default function Dashboard() {
  const { user, lastActiveAt } = useAuth();
  const navigate = useNavigate();
  const { getStatus, setStatus } = useSupplierReviewStatus();

  const emailedOnce = useRef(false);

  const { data, isLoading, isError } = useDashboardSummary();
  const dismissAlert = useDismissAlert();
  const restoreAlert = useRestoreAlert();
  const resync = useResyncDashboard();

  // Undo state for dismissed alerts
  const [pendingUndoId, setPendingUndoId] = useState<string | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [attentionFilter, setAttentionFilter] = useState<"all" | "high" | "medium">("all");
  const [attentionPage, setAttentionPage] = useState(0);

  // Limit rows only for the Dashboard widget; the Suppliers page shows the full list
  const ATTENTION_WIDGET_VISIBLE_LIMIT = 3;

  // Clean up the Undo timer if the component unmounts
  useEffect(() => {
  if (!pendingUndoId) return;

  const interval = setInterval(() => {
    setUndoSeconds((seconds) => {
      if (seconds <= 1) {
        setPendingUndoId(null);
        return 0;
      }
      return seconds - 1;
    });
  }, 1000);

  // Clear the previous undo timer when the toast changes or the component unmounts
  return () => clearInterval(interval);
}, [pendingUndoId]);


  function handleDismissAlert(id: string) {
  dismissAlert.mutate(
    { id, dismissedBy: user?.email ?? "unknown" },
    {
      onSuccess: () => {
        setPendingUndoId(id);
        setUndoSeconds(5);
      },
    }
  );
}

  function handleUndoDismiss() {
  if (!pendingUndoId) return;
  restoreAlert.mutate(pendingUndoId);
  setPendingUndoId(null);
  setUndoSeconds(0);
}

  async function handleDownloadRiskLog() {
    const rows = await getRiskLogRows();

    downloadCsv(
      `risk-log-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(rows)
    );
  }

  function handleInvestigateAlert(alertId: string) {
    const alert = data?.recentAlerts.find((a) => a.id === alertId);

    if (!alert?.supplierId) return;

    // Pass the alert context so Supplier Details can open on the relevant issue
    navigate(`/admin/suppliers?supplierId=${alert.supplierId}`);
  }

  // DEV DEMO ONLY — verifies the email flow with the signed-in admin and alert data
  useEffect(() => {
    if (emailedOnce.current || !user || !data) return;

    const highSeverity = data.recentAlerts.filter(
      (a) => a.severity === "high"
    );

    if (highSeverity.length === 0) return;

    emailedOnce.current = true;

    sendEmailNotification(
      {
        type: "high-risk-supplier",
        subject: `${highSeverity.length} high-severity alert(s) need attention`,
        message: highSeverity
          .map((a) => `${a.title}: ${a.description}`)
          .join("\n"),
      },
      user.email
    );
  }, [user, data]);

  useEffect(() => {
    if (!data || isError) return;
    setAttentionPage(0);
  }, [attentionFilter, data, isError]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // TODO: Define the UI for partial failures when the real endpoint is available
  if (isError || !data) {
    return (
      <div className="text-sm text-red-700">
        Couldn't load the dashboard summary, Try again!
      </div>
    );
  }

  const { kpis, riskClassification, suppliersRequiringAttention, issueCategoryBreakdown, recentAlerts } = data;

  const riskPriority: Record<string, number> = {
    high: 0,
    medium: 1,
    compliant: 2,
  };

  const prioritizedSuppliersRequiringAttention = [...suppliersRequiringAttention].sort((a, b) => {
    const priorityDifference = (riskPriority[a.risk] ?? 999) - (riskPriority[b.risk] ?? 999);
    return priorityDifference === 0 ? 0 : priorityDifference;
  });

  const filteredAttentionSuppliers = prioritizedSuppliersRequiringAttention.filter((supplier) => {
    if (attentionFilter === "all") return true;
    if (attentionFilter === "high") return supplier.risk === "high";
    return supplier.risk === "medium";
  });

  // "Review complete" only removes the supplier from this admin-triage view; risk data remains unchanged
  const activeAttentionSuppliers = filteredAttentionSuppliers.filter(
    (s) => getStatus(s.id) !== "resolved"
  );
  const maxAttentionPages = Math.max(1, Math.ceil(activeAttentionSuppliers.length / ATTENTION_WIDGET_VISIBLE_LIMIT));
  const safeAttentionPage = Math.min(attentionPage, maxAttentionPages - 1);
  const startAttentionIndex = safeAttentionPage * ATTENTION_WIDGET_VISIBLE_LIMIT;
  const shownAttentionSuppliers = activeAttentionSuppliers.slice(
    startAttentionIndex,
    startAttentionIndex + ATTENTION_WIDGET_VISIBLE_LIMIT
  );
  const hasMoreAttentionSuppliers = safeAttentionPage < maxAttentionPages - 1;
  const hasPreviousAttentionSuppliers = safeAttentionPage > 0;
  const emptyAttentionMessage =
    attentionFilter === "all"
      ? "No suppliers requiring attention."
      : attentionFilter === "high"
        ? "No high-risk suppliers requiring attention."
        : "No medium-risk suppliers requiring attention.";

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <div className="flex items-center gap-2">
  {lastActiveAt && (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-mono text-neutral-500">
      Last active: {formatSyncTime(lastActiveAt)}
    </span>
  )}
  <button
    onClick={() => resync.mutate()}
    disabled={resync.isPending}
    className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 hover:border-neutral-300 active:scale-95 active:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 disabled:opacity-50 disabled:active:scale-100"
  >
    <RefreshCw className={`h-3 w-3 ${resync.isPending ? "animate-spin" : ""}`} />
    {resync.isPending ? "Syncing…" : "Sync now"}
  </button>
</div>

          <h1 className="mt-2 font-headline text-2xl font-semibold text-neutral-900">
            Municipal environmental compliance overview
          </h1>

          <p className="mt-1 text-sm text-neutral-500">
            Real-time monitoring across municipal suppliers, contracts, and
            fleet emissions
            {user?.name
              ? ` — welcome back, ${user.name.split(" ")[0]}`
              : ""}
            .
          </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <DashboardExportButton data={data} />
          </div>
        </div>
      </div>

      <QuickActions />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active contracts"
          value={kpis.totalSuppliers}
          sublabel="total"
          note={`+${kpis.totalSuppliersDeltaThisMonth} renewed this month`}
          icon={<Users className="h-4 w-4" />}
        />

        <KpiCard
          label="High-risk suppliers"
          value={kpis.highRiskSuppliers}
          sublabel={`/ ${kpis.monitoredSuppliers} monitored`}
          note={`Action required on ${riskClassification.high.count}`}
          noteTone="danger"
          icon={<ShieldAlert className="h-4 w-4" />}
        />

        <KpiCard
          label="Active alerts"
          value={kpis.activeAlerts}
          sublabel="open events"
          note={`${kpis.alertsBySeverity.high} high · ${kpis.alertsBySeverity.medium} medium`}
          icon={<Bell className="h-4 w-4" />}
        />

        <KpiCard
          label="Compliance rate"
          value={`${kpis.complianceRatePercent}%`}
          sublabel={`target ${kpis.complianceTargetPercent}%`}
          note={
            kpis.complianceRatePercent >= kpis.complianceTargetPercent
              ? "On target"
              : `${(
                  kpis.complianceTargetPercent -
                  kpis.complianceRatePercent
                ).toFixed(1)}% to target`
          }
          noteTone={
            kpis.complianceRatePercent >= kpis.complianceTargetPercent
              ? "success"
              : "neutral"
          }
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {/* Risk classification */}
      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <h2 className="font-headline text-base font-semibold text-neutral-900">
          Supplier risk classification
        </h2>

        <p className="mb-4 text-xs text-neutral-400">
          Portfolio split across monitored municipal contractors
        </p>

        <RiskClassificationBar data={riskClassification} />
      </section>

      <IssueCategoryPanel data={issueCategoryBreakdown} />

      {/* Suppliers requiring attention + recent alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Suppliers requiring attention */}
        <section className="self-start rounded-xl border border-neutral-100 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-headline text-base font-semibold text-neutral-900">
                Suppliers requiring attention
              </h2>
            </div>

            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Risk:</span>
              <select
                value={attentionFilter}
                onChange={(event) => setAttentionFilter(event.target.value as "all" | "high" | "medium")}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                aria-label="Filter suppliers by risk level"
              >
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </label>
          </div>

          {shownAttentionSuppliers.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">{emptyAttentionMessage}</div>
          ) : (
            <TopRiskSuppliersTable
              suppliers={shownAttentionSuppliers}
              actionLabel="View Details"
              getReviewStatus={getStatus}
              onSelect={(supplier) => navigate(`/admin/suppliers?supplierId=${supplier.id}`)}
              onMarkReviewComplete={(supplier) => setStatus(supplier.id, "resolved")}
            />
          )}

          {/* Bottom footer */}
          {shownAttentionSuppliers.length > 0 && (
            <div className="-mx-4 -mb-4 mt-3 rounded-b-xl bg-neutral-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-neutral-500">
                  Showing {shownAttentionSuppliers.length} of {activeAttentionSuppliers.length}{" "}
                  suppliers requiring attention
                  {hasMoreAttentionSuppliers && (
                    <>
                      {" · "}
                      <button
                        onClick={() => navigate("/admin/suppliers")}
                        className="font-medium text-secondary-700 hover:text-secondary-800"
                      >
                        View all suppliers
                      </button>
                    </>
                  )}
                </p>

                <button
                  onClick={handleDownloadRiskLog}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download full risk log (CSV)
                </button>
              </div>

              {(hasPreviousAttentionSuppliers || hasMoreAttentionSuppliers) && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  {hasPreviousAttentionSuppliers && (
                    <button
                      type="button"
                      onClick={() => setAttentionPage((page) => Math.max(0, page - 1))}
                      className="inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Previous
                    </button>
                  )}
                  {hasMoreAttentionSuppliers && (
                    <button
                      type="button"
                      onClick={() => setAttentionPage((page) => Math.min(maxAttentionPages - 1, page + 1))}
                      className="inline-flex items-center justify-center rounded-lg bg-primary-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                    >
                      Next
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Recent alerts */}
        <section className="rounded-xl border border-neutral-100 bg-white p-4">
          <h2 className="font-headline text-base font-semibold text-neutral-900">
            Recent alerts
          </h2>

          <p className="mb-1 text-xs text-neutral-400">
            Most recent events first
          </p>

          <div>
            {recentAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDismiss={handleDismissAlert}
                onInvestigate={() => handleInvestigateAlert(alert.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Dismiss confirmation / Undo */}
      {pendingUndoId && (
  <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card">
    <span>Alert dismissed</span>
    <button
      onClick={handleUndoDismiss}
      className="font-semibold text-tertiary-300 hover:text-tertiary-200"
    >
      Undo <span className="text-neutral-400">({undoSeconds}s)</span>
    </button>
  </div>
)}
    </div>
  );
}