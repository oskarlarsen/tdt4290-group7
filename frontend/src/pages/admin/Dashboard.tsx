import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, Download, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSupplierReviewStatus } from "../../hooks/useSupplierReviewStatus";
import { useDashboardSummary, useResyncDashboard, useUpdateAlertStatus } from "../../hooks/useDashboardSummary";
import { formatSyncTime } from "../../utils/formatSyncTime";
import { KpiCard } from "../../components/ui/KpiCard";
import { DashboardExportButton } from "../../components/ui/QuickActions";
import { RiskClassificationBar } from "../../components/risk/RiskClassificationBar";
import { IssueCategoryPanel } from "../../components/risk/IssueCategoryPanel";
import { TopRiskSuppliersTable } from "../../components/suppliers/TopRiskSuppliersTable";
import { AlertCard } from "../../components/alerts/AlertCard";
import { getRiskLogRows } from "../../api/dashboard";
import { downloadCsv, toCsv } from "../../utils/csv";
import type { AlertStatus } from "../../types/dashboard";

type RiskFilter = "all" | "high" | "medium";
const ATTENTION_WIDGET_VISIBLE_LIMIT = 3;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getStatus, setStatus, errorMessage: reviewStatusError } = useSupplierReviewStatus();
  const { data, isLoading, isError, error, refetch } = useDashboardSummary();
  const updateAlertStatus = useUpdateAlertStatus();
  const resync = useResyncDashboard();
  const [pendingUndo, setPendingUndo] = useState<{ id: string; previousStatus: AlertStatus } | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [alertStatusError, setAlertStatusError] = useState<string | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<RiskFilter>("all");
  const [attentionPage, setAttentionPage] = useState(0);

  useEffect(() => {
    if (!pendingUndo) return;
    const timer = window.setInterval(() => {
      setUndoSeconds((seconds) => {
        if (seconds <= 1) {
          setPendingUndo(null);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingUndo]);

  useEffect(() => setAttentionPage(0), [attentionFilter, data]);

  function resolveAlert(id: string) {
    const previousStatus = data?.recentAlerts.find((alert) => alert.id === id)?.status;
    if (!previousStatus) return;
    setAlertStatusError(null);
    updateAlertStatus.mutate(
      { id, status: "RESOLVED" },
      {
        onSuccess: () => {
          setPendingUndo({ id, previousStatus });
          setUndoSeconds(5);
        },
        onError: (cause) => setAlertStatusError(cause instanceof Error ? cause.message : "Could not update alert status"),
      },
    );
  }

  function undoResolve() {
    if (!pendingUndo) return;
    setAlertStatusError(null);
    updateAlertStatus.mutate(
      { id: pendingUndo.id, status: pendingUndo.previousStatus },
      {
        onSuccess: () => {
          setPendingUndo(null);
          setUndoSeconds(0);
        },
        onError: (cause) => setAlertStatusError(cause instanceof Error ? cause.message : "Could not restore alert status"),
      },
    );
  }

  async function downloadRiskLog() {
    try {
      const rows = await getRiskLogRows();
      downloadCsv(`risk-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    } catch (cause) {
      setAlertStatusError(cause instanceof Error ? cause.message : "Could not download risk report");
    }
  }

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-sm text-neutral-500">Loading dashboard…</div>;
  }

  if (isError || !data) {
    return (
      <div className="space-y-3 p-4">
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">Municipal environmental compliance overview</h1>
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load the dashboard: {error instanceof Error ? error.message : "Please try again."}
        </div>
        <button type="button" onClick={() => void refetch()} className="rounded-lg bg-primary-900 px-3 py-2 text-sm text-white">
          Retry
        </button>
      </div>
    );
  }

  const activeAttentionSuppliers = data.suppliersRequiringAttention
    .filter((supplier) => attentionFilter === "all" || supplier.risk === attentionFilter)
    .filter((supplier) => getStatus(supplier.id) !== "resolved");
  const maxPages = Math.max(1, Math.ceil(activeAttentionSuppliers.length / ATTENTION_WIDGET_VISIBLE_LIMIT));
  const currentPage = Math.min(attentionPage, maxPages - 1);
  const visibleSuppliers = activeAttentionSuppliers.slice(
    currentPage * ATTENTION_WIDGET_VISIBLE_LIMIT,
    (currentPage + 1) * ATTENTION_WIDGET_VISIBLE_LIMIT,
  );
  const alertsBySeverity = data.kpis.alertsBySeverity;
  const noFlagRate = data.kpis.complianceRatePercent;

  return (
    <div className="space-y-4 p-4">
      <header className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-mono text-xs text-neutral-500">
                Data refreshed: {formatSyncTime(data.lastSyncedAt)}
              </span>
              <button
                type="button"
                onClick={() =>
                  resync.mutate(undefined, {
                    onError: (cause) =>
                      setAlertStatusError(cause instanceof Error ? cause.message : "Could not refresh dashboard data"),
                  })
                }
                disabled={resync.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${resync.isPending ? "animate-spin" : ""}`} />
                {resync.isPending ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <h1 className="mt-2 font-headline text-2xl font-semibold text-neutral-900">
              Municipal environmental compliance overview
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Persisted suppliers, agreements, vehicle checks, and certificates
              {user?.name ? ` — welcome back, ${user.name.split(" ")[0]}` : ""}.
            </p>
          </div>
          <DashboardExportButton data={data} />
        </div>
      </header>

      <section aria-label="Portfolio metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Active suppliers"
          value={data.kpis.totalSuppliers}
          sublabel="organizations"
          note={`${data.kpis.activeAgreements} active agreements`}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="High-risk suppliers"
          value={data.kpis.highRiskSuppliers}
          sublabel={`/ ${data.kpis.totalSuppliers} active`}
          note={`${data.kpis.assessedSuppliers} assessed from stored evidence`}
          noteTone="danger"
          href="/admin/suppliers?risk=high"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiCard
          label="Unresolved alerts"
          value={data.kpis.activeAlerts}
          sublabel="not yet resolved"
          note={`${alertsBySeverity.high} high · ${alertsBySeverity.medium} medium${alertsBySeverity.low ? ` · ${alertsBySeverity.low} low` : ""}`}
          href="/admin/alerts?status=unresolved"
          icon={<Bell className="h-4 w-4" />}
        />
        <KpiCard
          label="No flagged evidence"
          value={`${noFlagRate}%`}
          sublabel={`/ ${data.kpis.assessedSuppliers} assessed suppliers`}
          note="Based on stored vehicle checks and dated certificates"
          noteTone="neutral"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <h2 className="font-headline text-base font-semibold text-neutral-900">Supplier risk classification</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Assessment uses persisted vehicle findings and certificate expiry dates; suppliers with no evidence yet are listed as Not assessed.
        </p>
        <RiskClassificationBar data={data.riskClassification} />
      </section>

      <IssueCategoryPanel data={data.issueCategoryBreakdown} />

      <section aria-label="Fleet and certificate totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Listed vehicles" value={data.kpis.listedVehicles} href="/admin/vehicles" />
        <Metric label="Certificates tracked" value={data.kpis.certificatesTracked} href="/admin/certificates" />
        <Metric label="Expired certificates" value={data.kpis.expiredCertificates} href="/admin/certificates" />
        <Metric label="Expiring in 90 days" value={data.kpis.certificatesExpiringWithin90Days} href="/admin/certificates" />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="self-start rounded-xl border border-neutral-100 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-headline text-base font-semibold text-neutral-900">Suppliers requiring attention</h2>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Risk:</span>
              <select
                value={attentionFilter}
                onChange={(event) => setAttentionFilter(event.target.value as RiskFilter)}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs"
                aria-label="Filter suppliers by risk level"
              >
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
              </select>
            </label>
          </div>
          {visibleSuppliers.length === 0 ? (
            <div className="py-8 text-center text-sm text-neutral-500">No assessed suppliers require attention.</div>
          ) : (
            <TopRiskSuppliersTable
              suppliers={visibleSuppliers}
              actionLabel="View Details"
              getReviewStatus={getStatus}
              onSelect={(supplier) => navigate(`/admin/suppliers?supplierId=${supplier.id}`)}
              onMarkReviewComplete={(supplier) => setStatus(supplier.id, "resolved")}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-3 py-2">
            <button type="button" onClick={() => navigate("/admin/suppliers")} className="text-xs font-medium text-secondary-700">
              View supplier directory
            </button>
            <button
              type="button"
              onClick={() => void downloadRiskLog()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              <Download className="h-3.5 w-3.5" />
              Download risk log (CSV)
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setAttentionPage((page) => Math.max(0, page - 1))}
                className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-mono text-xs text-neutral-500">{currentPage + 1}/{maxPages}</span>
              <button
                type="button"
                disabled={currentPage >= maxPages - 1}
                onClick={() => setAttentionPage((page) => Math.min(maxPages - 1, page + 1))}
                className="rounded border border-neutral-200 px-2 py-1 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-100 bg-white p-4">
          <h2 className="font-headline text-base font-semibold text-neutral-900">Recent alerts</h2>
          <p className="mb-1 text-xs text-neutral-500">Most recent events first</p>
          {data.recentAlerts.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No unresolved alerts.</p>
          ) : (
            data.recentAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onResolve={resolveAlert}
                onInvestigate={() => alert.supplierId && navigate(`/admin/suppliers?supplierId=${alert.supplierId}`)}
                isUpdating={updateAlertStatus.isPending}
              />
            ))
          )}
          <button type="button" onClick={() => navigate("/admin/alerts")} className="mt-2 text-xs font-medium text-secondary-700">
            View all alerts
          </button>
        </section>
      </div>

      <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        Fuel and energy commitments are not assessed yet. “No flagged evidence” only reflects persisted vehicle checks and dated certificate records, not overall legal or environmental compliance.
      </p>

      {pendingUndo && (
        <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card">
          <span>Alert resolved</span>
          <button type="button" onClick={undoResolve} disabled={updateAlertStatus.isPending} className="font-semibold text-tertiary-300">
            Undo ({undoSeconds}s)
          </button>
        </div>
      )}
      {(alertStatusError || reviewStatusError) && (
        <div role="alert" className="fixed bottom-6 left-6 z-50 rounded-lg bg-red-700 px-4 py-3 text-sm text-white shadow-card">
          {alertStatusError ?? reviewStatusError}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      to={href}
      className="rounded-xl border border-neutral-100 bg-white p-4 text-left hover:border-neutral-300"
    >
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <span className="mt-1 block text-2xl font-semibold text-neutral-900">{new Intl.NumberFormat().format(value)}</span>
    </Link>
  );
}
