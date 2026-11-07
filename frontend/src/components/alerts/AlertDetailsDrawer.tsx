import { useEffect, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertFindingBadge, AlertStatusBadge, SeverityBadge, ALERT_SEVERITY_LABELS, ALERT_STATUS_LABELS } from "./AlertBadges";
import type { AlertRow } from "./AlertsTable";
import { formatAlertCreatedDate } from "../../utils/alertAge";
import { ALERT_CATEGORIES, ALERT_STATUSES } from "../../types/dashboard";
import type { AlertCategory, AlertContentUpdate, AlertSeverity, AlertStatus } from "../../types/dashboard";

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  ENVIRONMENTAL_COMPLIANCE: "Environmental Compliance",
  ENERGY_FUEL: "Energy & Fuel",
  VEHICLE_COMPLIANCE: "Vehicle Compliance",
  CERTIFICATES: "Certificates",
};

export function AlertDetailsDrawer({
  row,
  onClose,
  onStatusChange,
  onEdit,
  isBusy,
  statusMessage,
  statusError,
}: {
  row: AlertRow | null;
  onClose: () => void;
  onStatusChange: (alertId: string, status: AlertStatus) => void;
  /** Saves changes to a manual alert; rejects with a message the drawer shows. */
  onEdit?: (alertId: string, changes: AlertContentUpdate) => Promise<void>;
  isBusy: boolean;
  statusMessage?: string;
  statusError?: boolean;
}) {
  const navigate = useNavigate();
  const isOpen = row !== null;
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: "", description: "", severity: "medium" as AlertSeverity, dueDate: "" });

  // A different alert, or closing the drawer, ends any edit in progress.
  useEffect(() => {
    setEditing(false);
    setEditError("");
  }, [row?.alert.id]);

  function startEditing() {
    if (!row) return;
    const { title, description, severity, dueDate } = row.alert;
    setDraft({ title, description, severity, dueDate: dueDate ?? "" });
    setEditError("");
    setEditing(true);
  }

  async function saveEdit() {
    if (!row || !onEdit) return;
    if (!draft.title.trim() || !draft.description.trim()) {
      setEditError("Title and description are required.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await onEdit(row.alert.id, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        severity: draft.severity,
        dueDate: draft.dueDate,
      });
      setEditing(false);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not save the alert.");
    } finally {
      setSaving(false);
    }
  }

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
  const supplier = row?.supplier;
  const statusDescriptions: Record<AlertStatus, string> = {
    OPEN: "A new alert that no one has started handling.",
    IN_PROGRESS: "Someone has started working on this alert.",
    UNDER_REVIEW: "The reported deviation is being investigated or verified.",
    RESOLVED: "The issue has been addressed and no further action is currently required.",
  };

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
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title="Alert">
                <Field label="Risk" value={ALERT_SEVERITY_LABELS[alert.severity]} />
                <Field label="Created On" value={formatAlertCreatedDate(alert.createdAt)} />
                <Field label="Status" value={ALERT_STATUS_LABELS[alert.status]} />
                <Field label="Source" value={alert.source === "MANUAL" ? "Manual" : "Automatic"} />
                {alert.category && <Field label="Risk Category" value={CATEGORY_LABELS[alert.category]} />}
                {alert.dueDate && <Field label="Due Date" value={formatAlertCreatedDate(alert.dueDate)} />}
              </Section>

              <Section title="Summary">
                {alert.findingType && (
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    <span className="text-xs text-neutral-500">Alert Type:</span>
                    <AlertFindingBadge findingType={alert.findingType} />
                  </div>
                )}
                {editing ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-neutral-700">
                      Title
                      <input
                        value={draft.title}
                        maxLength={200}
                        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                        className="mt-1 w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm text-neutral-700"
                      />
                    </label>
                    <label className="block text-xs font-medium text-neutral-700">
                      Description
                      <textarea
                        value={draft.description}
                        rows={4}
                        maxLength={4000}
                        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                        className="mt-1 w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm text-neutral-700"
                      />
                    </label>
                    <label className="block text-xs font-medium text-neutral-700">
                      Risk
                      <select
                        value={draft.severity}
                        onChange={(event) => setDraft({ ...draft, severity: event.target.value as AlertSeverity })}
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-700"
                      >
                        {(Object.keys(ALERT_SEVERITY_LABELS) as AlertSeverity[]).map((severity) => (
                          <option key={severity} value={severity}>{ALERT_SEVERITY_LABELS[severity]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-neutral-700">
                      Due date (optional)
                      <input
                        type="date"
                        value={draft.dueDate}
                        onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                        className="mt-1 w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm text-neutral-700"
                      />
                    </label>
                    {editError && <p role="alert" className="text-xs text-red-700">{editError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        disabled={saving}
                        className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        disabled={saving}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-neutral-700">{alert.description}</p>
                    {alert.source === "MANUAL" && onEdit && (
                      <button
                        type="button"
                        onClick={startEditing}
                        className="mt-2 text-xs font-medium text-secondary-700 hover:text-secondary-800"
                      >
                        Edit alert
                      </button>
                    )}
                  </>
                )}
                {alert.findingType === "MISSING_DOCUMENTATION" && (
                  <p className="mt-2 text-xs leading-5 text-neutral-500">
                    Required evidence has not been submitted. Missing documentation alone does not
                    confirm a contractual violation.
                  </p>
                )}
              </Section>

              <Section title="Supplier & contract">
                <Field
                  label="Supplier"
                  value={contract?.supplierName ?? supplier?.displayName ?? "Not available in demo data"}
                />
                <Field
                  label="Contract"
                  value={
                    contract?.contractName ??
                    (supplier?.primaryContract !== "Not assigned" ? supplier?.primaryContract : undefined) ??
                    "Not available in demo data"
                  }
                />
                {(contract || supplier) && (
                  <>
                    <Field label="Org ID" value={contract?.supplierOrgId ?? supplier?.orgId ?? "Not available in demo data"} />
                    <button
                      onClick={() => navigate(`/admin/suppliers?supplierId=${contract?.supplierId ?? supplier?.id}`)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                    >
                      View supplier
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </Section>

              <Section title="Affected item & reason">
                <Field
                  label={alert.affectedItem?.type ?? "Affected item"}
                  value={alert.affectedItem?.name ?? "Not available in demo data"}
                />
                <Field
                  label="Reason"
                  value={alert.reason ?? "No reason recorded in demo data"}
                />
              </Section>

              <Section title="Workflow">
                <label className="block text-xs font-medium text-neutral-700" htmlFor="alert-status">
                  Status
                </label>
                <select
                  id="alert-status"
                  value={alert.status}
                  onChange={(event) => {
                    const status = ALERT_STATUSES.find(
                      (candidate) => candidate === event.target.value
                    );
                    if (status) onStatusChange(alert.id, status);
                  }}
                  disabled={isBusy}
                  className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-700 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10 disabled:opacity-60"
                >
                  {ALERT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ALERT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  {isBusy ? "Saving status…" : statusDescriptions[alert.status]}
                </p>
                {statusMessage && (
                  <p
                    role={statusError ? "alert" : "status"}
                    className={`mt-2 text-xs ${statusError ? "text-red-700" : "text-tertiary-700"}`}
                  >
                    {statusMessage}
                  </p>
                )}
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
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-1 text-sm">
      <span className="block text-left text-neutral-500">{label}</span>
      <span className="block text-left font-medium text-neutral-900">{value}</span>
    </div>
  );
}