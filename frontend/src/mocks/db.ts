// TODO: Add the dismissAlert mutation when the Dismiss button is connected

import type { RiskClassification, TopRiskSupplier, RecentAlert } from "../types/dashboard";
import { formatSyncTime } from "../utils/formatSyncTime";
import type { Notification, NotificationSeverity } from "../types/notification";


// Supplier risk classification 
// TODO: Add the full supplier list when the real endpoint is available
const TOTAL_MONITORED_SUPPLIERS = 151;
const BULK_HIGH_RISK_UNLISTED = 4; // + 3 modeled high below = 7 total
const BULK_MEDIUM_RISK_UNLISTED = 25; // + 1 modeled medium below = 26 total

const highRiskSuppliers: TopRiskSupplier[] = [
  { id: "sup-a", displayName: "Supplier A", orgId: "NO 924 812 443 MVA", primaryContract: "Skolerute 2023-2026", risk: "high", mainIssue: "3 Euro-5 non-compliant heavy vehicles", issueCategory: "VEHICLE_DEVIATION" },
  { id: "sup-b", displayName: "Supplier B", orgId: "NO 811 693 219 MVA", primaryContract: "Kommunalt Avfall 24", risk: "high", mainIssue: "ISO 14001 expired 14 days ago", issueCategory: "CERTIFICATE_EXPIRY" },
  { id: "sup-c", displayName: "Supplier C", orgId: "NO 994 204 117 MVA", primaryContract: "Skolebygg Rehabilitering", risk: "medium", mainIssue: "Biogas share dropped below 80%", issueCategory: "FUEL_DEVIATION" },
  { id: "sup-d", displayName: "Supplier D", orgId: "NO 938 100 293 MVA", primaryContract: "Varedistribusjon Oslo", risk: "high", mainIssue: "Fossil diesel share exceeded +18%", issueCategory: "FUEL_DEVIATION" },
  { id: "sup-e", displayName: "Supplier E", orgId: "NO 882 381 920 MVA", primaryContract: "Kommunale Byggeplasser", risk: "compliant", mainIssue: "Q4 chemical audit documentation missing" },
];

export function getTopRiskSuppliers(): TopRiskSupplier[] {
  return highRiskSuppliers;
}

// Show suppliers with high or medium risk, regardless of alert status
export function getSuppliersRequiringAttention(): TopRiskSupplier[] {
  return highRiskSuppliers.filter((s) => s.risk === "high" || s.risk === "medium");
}

export function getRiskClassification(): RiskClassification {
  const modeledHigh = highRiskSuppliers.filter((s) => s.risk === "high").length;
  const modeledMedium = highRiskSuppliers.filter((s) => s.risk === "medium").length;

  const high = modeledHigh + BULK_HIGH_RISK_UNLISTED;
  const medium = modeledMedium + BULK_MEDIUM_RISK_UNLISTED;
  const compliant = TOTAL_MONITORED_SUPPLIERS - high - medium;

  const pct = (n: number) => Math.round((n / TOTAL_MONITORED_SUPPLIERS) * 100);
  return {
    compliant: { count: compliant, percent: pct(compliant) },
    medium: { count: medium, percent: pct(medium) },
    high: { count: high, percent: pct(high) },
  };
}

export function getMonitoredSupplierCount(): number {
  return TOTAL_MONITORED_SUPPLIERS;
}

// Recent alerts 
// TODO: Add full alert details when the real alerts endpoint is available
const BULK_HIGH_ALERTS_UNLISTED = 3; // + 2 modeled high below = 5 total
const BULK_MEDIUM_ALERTS_UNLISTED = 12; // + 2 modeled medium below = 14 total
// Combined the unsupported "low" alerts into "medium" so the total stays consistent

let alerts: RecentAlert[] = [
  { id: "alert-1", severity: "high", title: "Fjord Transport AS", description: "Unauthorized vehicle on route #402. Non-zero-emission class operating in zero-emission zone.", timeAgo: "20m ago", status: "ACTIVE", supplierId: "sup-a" },
  { id: "alert-2", severity: "high", title: "Nordisk Avfallshåndtering", description: "Environmental certificate (ISO 14001) lapsed without renewal update.", timeAgo: "3h ago", status: "ACTIVE", supplierId: "sup-b" },
  { id: "alert-3", severity: "medium", title: "Vikon Byggservice", description: "Biogas usage dropped below 80% contract minimum floor (recorded at 64%).", timeAgo: "5h ago", status: "ACTIVE", supplierId: "sup-c" },
  { id: "alert-4", severity: "medium", title: "Ren By Transport", description: "Missing Q1 fuel consumption telemetry submission. Grace period expires in 4 days.", timeAgo: "Yesterday", status: "ACTIVE", supplierId: "sup-d" },
 ];

// Get only active alerts; dismissed alerts are kept for history
export function getActiveAlerts(): RecentAlert[] {
  return alerts.filter((a) => a.status === "ACTIVE");
}

// Not called by any UI yet — ready for a future "Dismissed Alerts" view
export function getDismissedAlerts(): RecentAlert[] {
  return alerts.filter((a) => a.status === "DISMISSED");
}

// Dismiss only this alert while keeping its data and history
export function dismissAlert(id: string, dismissedBy: string): void {
  alerts = alerts.map((a) =>
    a.id === id
      ? { ...a, status: "DISMISSED", dismissedAt: new Date().toISOString(), dismissedBy }
      : a
  );
}

export function restoreAlert(id: string): void {
  alerts = alerts.map((a) =>
    a.id === id ? { ...a, status: "ACTIVE", dismissedAt: undefined, dismissedBy: undefined } : a
  );
}

export function getAlertsBySeverity(): { high: number; medium: number } {
  // Count only active alerts so dismissed alerts don't affect the KPI
  const active = getActiveAlerts();
  const modeledHigh = active.filter((a) => a.severity === "high").length;
  const modeledMedium = active.filter((a) => a.severity === "medium").length;
  return {
    high: modeledHigh + BULK_HIGH_ALERTS_UNLISTED,
    medium: modeledMedium + BULK_MEDIUM_ALERTS_UNLISTED,
  };
}

export function getActiveAlertsCount(): number {
  const { high, medium } = getAlertsBySeverity();
  return high + medium;
}

const SYNC_STORAGE_KEY = "last_synced_at";
function readStoredSync(): string | null {
  return sessionStorage.getItem(SYNC_STORAGE_KEY);
}
function writeStoredSync(iso: string) {
  sessionStorage.setItem(SYNC_STORAGE_KEY, iso);
}

export function getLastSyncedAt(): string {
  return readStoredSync() ?? "2026-09-15T08:42:00.000Z";
}

// Simulates the sync completing; the timestamp only changes when this is called
export function resyncNow(): string {
  const now = new Date().toISOString();
  writeStoredSync(now);
  return now;
}

export function getRiskLogRows() {
  return highRiskSuppliers.map((s) => ({
    Supplier: s.displayName,
    "Org ID": s.orgId,
    Contract: s.primaryContract,
    "Risk level": s.risk.toUpperCase(),
    Issue: s.mainIssue,
  }));
}

// Derive notifications from the current supplier data instead of storing a separate list
function buildNotifications(): Omit<Notification, "read">[] {
  const risky = highRiskSuppliers.filter((s) => s.risk !== "compliant" && s.issueCategory);

  const riskNotifications: Omit<Notification, "read">[] = risky.map((s) => ({
    id: `notif-risk-${s.id}`,
    type: s.issueCategory!,
    title: `${s.displayName} ${s.risk === "high" ? "became high risk" : "flagged medium risk"}`,
    message: s.mainIssue,
    severity: (s.risk === "high" ? "HIGH" : "MEDIUM") as NotificationSeverity,
    supplierId: s.id,
    timeAgo: "Recently",
  }));

  /// Use the sync timestamp in the ID so each sync creates a new notification
  const syncTimestamp = getLastSyncedAt();
  const syncNotification: Omit<Notification, "read"> = {
    id: `notif-sync-${syncTimestamp}`,
    type: "DATA_SYNC",
    title: "Data synchronization completed",
    message: "Supplier and vehicle data were successfully synchronized.",
    severity: "INFO",
    timeAgo: formatSyncTime(syncTimestamp),
  };

  return [...riskNotifications, syncNotification];
}
// Keep read state separate for each admin; persist it in the backend later
const readNotificationIds: Record<string, Set<string>> = {};

function readSetFor(userId: string): Set<string> {
  if (!readNotificationIds[userId]) readNotificationIds[userId] = new Set();
  return readNotificationIds[userId];
}

export function getNotifications(userId: string): Notification[] {
  const readSet = readSetFor(userId);
  return buildNotifications().map((n) => ({ ...n, read: readSet.has(n.id) }));
}

export function markNotificationAsRead(userId: string, id: string): void {
  readSetFor(userId).add(id);
}

export function markAllNotificationsAsRead(userId: string): void {
  const readSet = readSetFor(userId);
  buildNotifications().forEach((n) => readSet.add(n.id));
}