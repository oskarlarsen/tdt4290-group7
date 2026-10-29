import { useEffect } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertStatusBadge, SeverityBadge, ALERT_SEVERITY_LABELS, ALERT_STATUS_LABELS } from "./AlertBadges";
import type { AlertRow } from "./AlertsTable";

export function AlertDetailsDrawer({
  row,
  onClose,
  onDismiss,
  onRestore,
  isBusy,
}: {
  row: AlertRow | null;
  onClose: () => void;
  onDismiss: (alertId: string) => void;
  onRestore: (alertId: string) => void;
  isBusy: boolean;
}) {
  const navigate = useNavigate();
  const isOpen = row !== null;

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

  const alert = row?.alert;
  const contract = row?.contract;
  const isDismissed = alert?.status === "DISMISSED";

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
        aria-label={alert ? `${alert.title} details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {alert && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">{alert.title}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={alert.severity} />
                  <AlertStatusBadge status={alert.status} />
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
              <Section title="Alert">
                <Field label="Severity" value={ALERT_SEVERITY_LABELS[alert.severity]} />
                <Field label="Raised" value={alert.timeAgo} />
                <Field label="Status" value={ALERT_STATUS_LABELS[alert.status]} />
              </Section>

              <Section title="Summary">
                <p className="text-sm text-neutral-700">{alert.description}</p>
              </Section>

              <Section title="Linked supplier & contract">
                {contract ? (
                  <>
                    <Field label="Supplier" value={contract.supplierName} />
                    <Field label="Org ID" value={contract.supplierOrgId} />
                    <Field label="Contract" value={contract.contractName} />
                    <button
                      onClick={() => navigate(`/admin/suppliers?supplierId=${contract.supplierId}`)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                    >
                      View supplier
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">No supplier is linked to this alert.</p>
                )}
              </Section>

              {isDismissed && (
                <Section title="Dismissal">
                  <Field label="Dismissed by" value={alert.dismissedBy ?? "Unknown"} />
                  {alert.dismissedAt && (
                    <Field
                      label="Dismissed at"
                      value={new Date(alert.dismissedAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    />
                  )}
                </Section>
              )}

              <Section title="Actions">
                {isDismissed ? (
                  <button
                    onClick={() => onRestore(alert.id)}
                    disabled={isBusy}
                    className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {isBusy ? "Restoring…" : "Restore alert"}
                  </button>
                ) : (
                  <button
                    onClick={() => onDismiss(alert.id)}
                    disabled={isBusy}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {isBusy ? "Dismissing…" : "Dismiss alert"}
                  </button>
                )}
                <p className="mt-2 text-xs text-neutral-400">
                  Dismissing only removes the alert from the active view. It does not resolve the
                  underlying issue or change the supplier's risk.
                </p>
              </Section>

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