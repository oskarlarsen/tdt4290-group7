import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { toCsv, downloadCsv } from "../../utils/csv";
import type { DashboardSummary } from "../../types/dashboard";

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => navigate("/admin/suppliers")}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        View all suppliers
      </button>
      <button
        onClick={() => navigate("/admin/alerts")}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        View all alerts
      </button>
      <button
        onClick={() => navigate("/admin/certificates?upload=true")}
        className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
      >
        Add supplier certificate
      </button>
    </div>
  );
}

export function DashboardExportButton({ data }: { data: DashboardSummary | undefined }) {
  const [state, setState] = useState<"idle" | "done">("idle");

  // TODO: Replace the client-side export with the backend report endpoint
  function handleExport() {
    if (!data) return;
    const csv = toCsv([
      { Metric: "Active contracts", Value: data.kpis.totalSuppliers },
      { Metric: "High-risk suppliers", Value: data.kpis.highRiskSuppliers },
      { Metric: "Active alerts", Value: data.kpis.activeAlerts },
      { Metric: "Compliance rate (%)", Value: data.kpis.complianceRatePercent },
      { Metric: "Compliant suppliers", Value: data.riskClassification.compliant.count },
      { Metric: "Medium-risk suppliers", Value: data.riskClassification.medium.count },
      { Metric: "High-risk suppliers (classification)", Value: data.riskClassification.high.count },
    ]);
    downloadCsv(`overview-report-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    setState("done");
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button
      onClick={handleExport}
      disabled={!data}
      className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg bg-primary-900 px-3 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
    >
      <Download className="h-4 w-4" />
      {state === "done" ? "Downloaded" : "Export overview report"}
    </button>
  );
}