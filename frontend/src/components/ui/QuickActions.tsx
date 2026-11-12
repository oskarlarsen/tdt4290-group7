import { useState } from "react";
import { Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { downloadCsv, toSemicolonCsv } from "../../utils/csv";
import { buildOverviewRows, OVERVIEW_COLUMNS } from "../../utils/overviewExport";
import { getAlerts } from "../../api/alerts";
import type { DashboardSummary } from "../../types/dashboard";

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => navigate("/admin/suppliers")}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Vis alle leverandører
      </button>
      <button
        onClick={() => navigate("/admin/alerts")}
        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Vis alle varsler
      </button>
      <button
        onClick={() => navigate("/admin/certificates?upload=true")}
        className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
      >
        Legg til leverandørsertifikat
      </button>
    </div>
  );
}

export function DashboardExportButton({ data }: { data: DashboardSummary | undefined }) {
  const [state, setState] = useState<"idle" | "preparing" | "done" | "error">("idle");

  async function handleExport() {
    if (!data || state === "preparing") return;
    setState("preparing");
    try {
      // The summary only carries the ten most recent alerts, so the full list is fetched for the report.
      const alerts = await getAlerts();
      const csv = toSemicolonCsv(OVERVIEW_COLUMNS, buildOverviewRows(data, alerts));
      downloadCsv(`oversiktsrapport-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={() => void handleExport()}
        disabled={!data || state === "preparing"}
        className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg bg-primary-900 px-3 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {state === "preparing" ? "Forbereder…" : state === "done" ? "Lastet ned" : "Eksporter oversiktsrapport"}
      </button>
      {state === "error" && (
        <span role="alert" className="text-xs text-red-700">Kunne ikke forberede eksporten. Prøv igjen.</span>
      )}
    </span>
  );
}
