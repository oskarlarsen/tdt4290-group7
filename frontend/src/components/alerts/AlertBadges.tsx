import { StatusBadge } from "../ui/StatusBadge";
import type { AlertFindingType, AlertSeverity, AlertStatus } from "../../types/dashboard";

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  UNDER_REVIEW: "Under Review",
  RESOLVED: "Resolved",
};

export const ALERT_FINDING_LABELS: Record<AlertFindingType, string> = {
  CONFIRMED_DEVIATION: "Confirmed Deviation",
  MISSING_DOCUMENTATION: "Missing Documentation",
  UPCOMING_EXPIRY: "Upcoming Expiry",
};

const ALERT_FINDING_CLASSES: Record<AlertFindingType, string> = {
  CONFIRMED_DEVIATION: "bg-neutral-100 text-neutral-700",
  MISSING_DOCUMENTATION: "bg-amber-100 text-amber-800",
  UPCOMING_EXPIRY: "bg-blue-100 text-blue-700",
};

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <StatusBadge
      status={severity === "high" ? "red" : severity === "medium" ? "yellow" : "tertiary"}
      label={ALERT_SEVERITY_LABELS[severity]}
    />
  );
}

export function AlertFindingBadge({ findingType }: { findingType: AlertFindingType }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${ALERT_FINDING_CLASSES[findingType]}`}>
      {ALERT_FINDING_LABELS[findingType]}
    </span>
  );
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const classes: Record<AlertStatus, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    UNDER_REVIEW: "bg-violet-100 text-violet-700",
    RESOLVED: "bg-tertiary-100 text-tertiary-700",
  };
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-mono font-medium ${classes[status]}`}>
      {ALERT_STATUS_LABELS[status]}
    </span>
  );
}