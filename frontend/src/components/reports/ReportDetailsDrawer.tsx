import { useEffect } from "react";
import { ArrowUpRight, Download, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatGeneratedDue, ReportStatusBadge } from "./ReportsTable";
import type { ReportItem } from "./ReportsTable";
import { REPORT_CATEGORY_LABELS, formatReportScope } from "../../types/report";
import type { ReportId } from "../../types/report";
import { formatSyncTime } from "../../utils/formatSyncTime";

export function ReportDetailsDrawer({
  item,
  onClose,
  onGenerate,
}: {
  item: ReportItem | null;
  onClose: () => void;
  onGenerate: (reportId: ReportId) => void;
}) {
  const navigate = useNavigate();
  const isOpen = item !== null;

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const definition = item?.definition;
  const fields = item && item.rows.length > 0 ? Object.keys(item.rows[0]) : [];

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-40 bg-neutral-900/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={definition ? `${definition.title} details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {item && definition && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {definition.title}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ReportStatusBadge status={item.status} />
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-mono font-medium text-neutral-500">
                    {REPORT_CATEGORY_LABELS[definition.category]}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title="About this report">
                <p className="text-sm text-neutral-700">{definition.description}</p>
              </Section>

              <Section title="Contents">
                <Field label="Records" value={formatReportScope(definition, item.rows.length)} />
                <Field label="Reporting period" value={item.reportingPeriod ?? "—"} />
                <Field label="Generated due" value={formatGeneratedDue(item.generatedDueAt)} />
                <Field
                  label="Last generated"
                  value={item.lastGeneratedAt ? formatSyncTime(item.lastGeneratedAt) : "—"}
                />
                <p className="mt-1 text-xs text-neutral-400">{definition.scopeNote}.</p>
              </Section>

              <Section title="Included fields">
                {fields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {fields.map((field) => (
                      <span
                        key={field}
                        className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">
                    There are no records yet, so there are no fields to list.
                  </p>
                )}
              </Section>

              <Section title="Data source">
                <p className="text-sm text-neutral-700">
                  Built from the same data as the {definition.sourceLabel} page.
                </p>
                <button
                  onClick={() => navigate(definition.sourcePath)}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                >
                  Open {definition.sourceLabel}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Section>

              <Section title="Download">
                <button
                  onClick={() => onGenerate(definition.id)}
                  disabled={item.rows.length === 0}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download CSV
                </button>
              </Section>

              <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
                Demo data. This report is generated in your browser as a CSV file from fictional
                mock records. No PDF export, scheduled delivery or official filing exists, and
                nothing downloaded here is submitted anywhere.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}