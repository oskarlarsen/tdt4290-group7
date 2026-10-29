import { StatusBadge } from "../ui/StatusBadge";
import type { AlertSeverity, AlertStatus } from "../../types/dashboard";

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  high: "High",
  medium: "Medium",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  ACTIVE: "Active",
  DISMISSED: "Dismissed",
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <StatusBadge
      status={severity === "high" ? "red" : "yellow"}
      label={ALERT_SEVERITY_LABELS[severity]}
    />
  );
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const classes =
    status === "ACTIVE" ? "bg-tertiary-100 text-tertiary-700" : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-mono font-medium ${classes}`}>
      {ALERT_STATUS_LABELS[status]}
    </span>
  );
}