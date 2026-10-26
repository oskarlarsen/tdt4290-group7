import { Download } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import { formatReportScope } from "../../types/report";
import {
  REPORT_STATUS_LABELS,
  type ReportDefinition,
  type ReportId,
  type ReportRow,
  type ReportStatus,
} from "../../types/report";

export type ReportItem = {
  definition: ReportDefinition;
  rows: ReportRow[];
  status: ReportStatus;
  lastGeneratedAt: string | null;
  reportingPeriod: string | null;
  generatedDueAt: string | null;
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const title =
    status === "scheduled"
      ? "Demo lifecycle status only; automated delivery is not configured."
      : "Demo lifecycle status only; no real reporting workflow is connected.";

  if (status === "published") {
    return (
      <span title={title}>
        <StatusBadge status="tertiary" label={REPORT_STATUS_LABELS[status]} />
      </span>
    );
  }
  if (status === "under-review") {
    return (
      <span title={title}>
        <StatusBadge status="orange" label={REPORT_STATUS_LABELS[status]} />
      </span>
    );
  }
  if (status === "drafting") {
    return (
      <span title={title}>
        <StatusBadge status="yellow" label={REPORT_STATUS_LABELS[status]} />
      </span>
    );
  }
  return (
    <span title={title}>
      <span className="inline-block whitespace-nowrap rounded bg-primary-100 px-2 py-0.5 text-xs font-mono font-medium text-primary-900">
        {REPORT_STATUS_LABELS[status]}
      </span>
    </span>
  );
}

export function formatGeneratedDue(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ReportsTable({
  items,
  onSelect,
  onGenerate,
  emptyMessage = "No reports to show.",
}: {
  items: ReportItem[];
  onSelect: (item: ReportItem) => void;
  onGenerate: (reportId: ReportId) => void;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <div className="py-8 text-center text-sm text-neutral-400">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-400">
            <th className="pb-2 pr-3 font-medium">Report</th>
            <th className="pb-2 pr-3 font-medium">Scope</th>
            <th className="pb-2 pr-3 font-medium">Reporting period</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 pr-3 font-medium">Generated due</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const { definition, rows, status, reportingPeriod, generatedDueAt } = item;
            return (
              <tr key={definition.id} className="border-t border-neutral-100">
                <td className="min-w-65 py-3 pr-3">
                  <div className="font-medium text-neutral-900">{definition.title}</div>
                  <div className="text-xs text-neutral-500">{definition.description}</div>
                  <div className="mt-0.5 font-mono text-xs text-neutral-400">
                    Source: {definition.sourceLabel}
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <div className="whitespace-nowrap text-neutral-900">
                    {formatReportScope(definition, rows.length)}
                  </div>
                  <div className="text-xs text-neutral-400">{definition.scopeNote}</div>
                </td>
                <td className="whitespace-nowrap py-3 pr-3 text-neutral-700">
                  {reportingPeriod ?? "—"}
                </td>
                <td className="py-3 pr-3">
                  <ReportStatusBadge status={status} />
                </td>
                <td className="whitespace-nowrap py-3 pr-3 text-neutral-700">
                  {formatGeneratedDue(generatedDueAt)}
                </td>
                <td className="whitespace-nowrap py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onGenerate(definition.id)}
                      disabled={rows.length === 0}
                      title={rows.length === 0 ? "No records to include" : undefined}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download CSV
                    </button>
                    <button
                      onClick={() => onSelect(item)}
                      className="whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      View Details
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}