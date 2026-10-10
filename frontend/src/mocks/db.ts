// TODO: Add the dismissAlert mutation when the Dismiss button is connected

import type { RiskClassification, TopRiskSupplier, RecentAlert } from "../types/dashboard";
import { formatSyncTime } from "../utils/formatSyncTime";
import type { Notification, NotificationSeverity } from "../types/notification";
import type { ContractStatus, DerivedContract } from "../types/contract";

// Keep modeled suppliers separate from the remaining portfolio counts.
// Changes to a modeled supplier's risk automatically update the related dashboard numbers.
// The remaining suppliers are represented by aggregate counts until the real supplier API is available.
// TODO: Replace the aggregate data with the full supplier list from the backend.

const MODELED_SUPPLIERS: TopRiskSupplier[] = [
  { id: "sup-a", displayName: "Supplier A", orgId: "NO 924 812 443 MVA", primaryContract: "Skolerute 2023-2026", risk: "high", mainIssue: "3 Euro-5 non-compliant heavy vehicles", issueCategory: "VEHICLE_DEVIATION" },
  { id: "sup-b", displayName: "Supplier B", orgId: "NO 811 693 219 MVA", primaryContract: "Kommunalt Avfall 24", risk: "high", mainIssue: "ISO 14001 expired 14 days ago", issueCategory: "CERTIFICATE_EXPIRY" },
  { id: "sup-c", displayName: "Supplier C", orgId: "NO 994 204 117 MVA", primaryContract: "Skolebygg Rehabilitering", risk: "medium", mainIssue: "Biogas share dropped below 80%", issueCategory: "FUEL_DEVIATION" },
  { id: "sup-d", displayName: "Supplier D", orgId: "NO 938 100 293 MVA", primaryContract: "Varedistribusjon Oslo", risk: "high", mainIssue: "Fossil diesel share exceeded +18%", issueCategory: "FUEL_DEVIATION" },
  { id: "sup-e", displayName: "Supplier E", orgId: "NO 882 381 920 MVA", primaryContract: "Kommunale Byggeplasser", risk: "compliant", mainIssue: "Q4 chemical audit documentation missing" },
];

const UNMODELED_PORTFOLIO_AGGREGATE = {
  totalSuppliers: 151,
  high: 4,
  medium: 25,
};

function getModeledRiskCounts() {
  return {
    high: MODELED_SUPPLIERS.filter((s) => s.risk === "high").length,
    medium: MODELED_SUPPLIERS.filter((s) => s.risk === "medium").length,
  };
}

export function getTopRiskSuppliers(): TopRiskSupplier[] {
  return MODELED_SUPPLIERS;
}

// Use the same supplier data and risk filter as the classification bar to keep both in sync
export function getSuppliersRequiringAttention(): TopRiskSupplier[] {
  return MODELED_SUPPLIERS.filter((s) => s.risk === "high" || s.risk === "medium").sort((a, b) => {
    if (a.risk === b.risk) return 0;
    return a.risk === "high" ? -1 : 1;
  });
}

export function getRiskClassification(): RiskClassification {
  const modeled = getModeledRiskCounts();

  const high = modeled.high + UNMODELED_PORTFOLIO_AGGREGATE.high;
  const medium = modeled.medium + UNMODELED_PORTFOLIO_AGGREGATE.medium;
  const compliant = UNMODELED_PORTFOLIO_AGGREGATE.totalSuppliers - high - medium;

  const pct = (n: number) => Math.round((n / UNMODELED_PORTFOLIO_AGGREGATE.totalSuppliers) * 100);
  return {
    compliant: { count: compliant, percent: pct(compliant) },
    medium: { count: medium, percent: pct(medium) },
    high: { count: high, percent: pct(high) },
  };
}

export function getMonitoredSupplierCount(): number {
  return UNMODELED_PORTFOLIO_AGGREGATE.totalSuppliers;
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
  return MODELED_SUPPLIERS.map((s) => ({
    Supplier: s.displayName,
    "Org ID": s.orgId,
    Contract: s.primaryContract,
    "Risk level": s.risk.toUpperCase(),
    Issue: s.mainIssue,
  }));
}

// Derive notifications from the current supplier data instead of storing a separate list
function buildNotifications(): Omit<Notification, "read">[] {
  const risky = MODELED_SUPPLIERS.filter((s) => s.risk !== "compliant" && s.issueCategory);

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

export function getIssueCategoryBreakdown() {
  return {
    vehicleDeviation: MODELED_SUPPLIERS.filter((s) => s.issueCategory === "VEHICLE_DEVIATION").length,
    certificateExpiry: MODELED_SUPPLIERS.filter((s) => s.issueCategory === "CERTIFICATE_EXPIRY").length,
    fuelDeviation: MODELED_SUPPLIERS.filter((s) => s.issueCategory === "FUEL_DEVIATION").length,
    modeledSupplierCount: MODELED_SUPPLIERS.length,
  };
}

import type { SupplierNote } from "../types/dashboard";

const NOTES_STORAGE_KEY = "supplier_issue_notes";

function readStoredNotes(): SupplierNote[] {
  try {
    const stored = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as SupplierNote[]) : [];
  } catch {
    return [];
  }
}

function writeStoredNotes(notes: SupplierNote[]) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Keep the app usable if storage is unavailable.
  }
}

let supplierNotes: SupplierNote[] = readStoredNotes();

// TODO(backend): becomes real POST/GET /admin/suppliers/:id/notes
// TODO: Resolve authorName from the authenticated session when the backend is available
export function getNotesForSupplier(supplierId: string): SupplierNote[] {
  return supplierNotes
    .filter((n) => n.supplierId === supplierId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addSupplierNote(supplierId: string, authorName: string, text: string): SupplierNote {
  const note: SupplierNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    supplierId,
    authorName,
    text,
    createdAt: new Date().toISOString(),
  };
  supplierNotes = [...supplierNotes, note];
  writeStoredNotes(supplierNotes);
  return note;
}

// Fictional normalized demo points only; these are not real municipal measurements.
const MOCK_CONTRACT_DETAILS: Record<
  string,
  {
    status: ContractStatus;
    startDate: string;
    endDate: string;
    documentUrl: string | null;
    environmentalGoal: number;
    environmentalActual: number;
  }
> = {
  "sup-a": {
    status: "Active",
    startDate: "2023-08-01",
    endDate: "2026-07-31",
    documentUrl: "/documents/mock-contract.pdf",
    environmentalGoal: 100,
    environmentalActual: 62,
  },
  "sup-b": {
    status: "Expiring Soon",
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    documentUrl: "/documents/mock-contract.pdf",
    environmentalGoal: 100,
    environmentalActual: 68,
  },
  "sup-c": {
    status: "Active",
    startDate: "2023-03-15",
    endDate: "2027-03-14",
    documentUrl: "/documents/mock-contract.pdf",
    environmentalGoal: 100,
    environmentalActual: 82,
  },
  "sup-d": {
    status: "Expiring Soon",
    startDate: "2022-11-01",
    endDate: "2025-10-31",
    documentUrl: "/documents/mock-contract.pdf",
    environmentalGoal: 100,
    environmentalActual: 65,
  },
  "sup-e": {
    status: "Active",
    startDate: "2024-06-01",
    endDate: "2028-05-31",
    documentUrl: "/documents/mock-contract.pdf",
    environmentalGoal: 100,
    environmentalActual: 100,
  },
};

export function getDerivedContracts(): DerivedContract[] {
  return MODELED_SUPPLIERS.map((s) => {
    const mock = MOCK_CONTRACT_DETAILS[s.id];
    return {
      id: s.id,
      contractName: s.primaryContract,
      supplierId: s.id,
      supplierName: s.displayName,
      supplierOrgId: s.orgId,
      risk: s.risk,
      mainIssue: s.mainIssue,
      status: mock.status,
      startDate: mock.startDate,
      endDate: mock.endDate,
      documentUrl: mock.documentUrl,
      environmentalGoal: mock.environmentalGoal,
      environmentalActual: mock.environmentalActual,
    };
  });
}