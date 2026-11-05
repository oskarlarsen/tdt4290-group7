import type {
  TopRiskSupplier,
  RecentAlert,
  NewManualAlertInput,
  NewSupplierInput,
  RiskCategory,
} from "../types/dashboard";
import { buildSupplierPortfolioSummary } from "./supplierSummary";
import { formatSyncTime } from "../utils/formatSyncTime";
import { DUPLICATE_SUPPLIER_ORG_ID_MESSAGE, normalizeSupplierOrgId } from "../utils/supplier";
import type { Notification, NotificationSeverity } from "../types/notification";
import type { ContractStatus, DerivedContract } from "../types/contract";
import type { Certificate } from "../types/certificate";
import type { EnergyData, EnergyRecord, EnergyRequirement } from "../types/energy";

// Keep modeled suppliers separate from aggregate data for suppliers without mock records.
// Changes to a modeled supplier's risk or record count update the portfolio summary automatically.
// TODO: Replace the aggregate data with the full supplier list from the backend.

const MODELED_SUPPLIERS: (Omit<TopRiskSupplier, "risk"> & { risk: RiskCategory })[] = [
  { id: "sup-a", displayName: "Supplier A", orgId: "NO 924 812 443 MVA", primaryContract: "Skolerute 2023-2026", risk: "high", mainIssue: "3 Euro-5 non-compliant heavy vehicles", issueCategory: "VEHICLE_DEVIATION" },
  { id: "sup-b", displayName: "Supplier B", orgId: "NO 811 693 219 MVA", primaryContract: "Kommunalt Avfall 24", risk: "high", mainIssue: "ISO 14001 expired 14 days ago", issueCategory: "CERTIFICATE_EXPIRY" },
  { id: "sup-c", displayName: "Supplier C", orgId: "NO 994 204 117 MVA", primaryContract: "Skolebygg Rehabilitering", risk: "medium", mainIssue: "Biogas share dropped below 80%", issueCategory: "FUEL_DEVIATION" },
  { id: "sup-d", displayName: "Supplier D", orgId: "NO 938 100 293 MVA", primaryContract: "Varedistribusjon Oslo", risk: "high", mainIssue: "Fossil diesel share exceeded +18%", issueCategory: "FUEL_DEVIATION" },
  { id: "sup-e", displayName: "Supplier E", orgId: "NO 882 381 920 MVA", primaryContract: "Kommunale Byggeplasser", risk: "compliant", mainIssue: "Q4 chemical audit documentation missing" },
];

const UNMODELED_SUPPLIER_AGGREGATE = {
  totalSuppliers: 146,
  highRiskSuppliers: 4,
  mediumRiskSuppliers: 25,
};

const SUPPLIER_DEMO_METRICS = {
  renewedThisMonthCount: 4,
};

export function getSupplierPortfolioSummary() {
  return buildSupplierPortfolioSummary(
    MODELED_SUPPLIERS,
    UNMODELED_SUPPLIER_AGGREGATE,
    SUPPLIER_DEMO_METRICS.renewedThisMonthCount
  );
}

export function getTopRiskSuppliers(): TopRiskSupplier[] {
  return [...MODELED_SUPPLIERS, ...addedSuppliers];
}

const ADDED_SUPPLIERS_STORAGE_KEY = "added_mock_suppliers";

function isAddedSupplier(value: unknown): value is TopRiskSupplier {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const supplier = value as Record<string, unknown>;
  return (
    typeof supplier.id === "string" &&
    typeof supplier.displayName === "string" &&
    typeof supplier.orgId === "string" &&
    supplier.primaryContract === "Not assigned" &&
    supplier.risk === "unassessed" &&
    supplier.mainIssue === "Awaiting compliance assessment."
  );
}

function readAddedSuppliers(): TopRiskSupplier[] {
  try {
    const stored = localStorage.getItem(ADDED_SUPPLIERS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isAddedSupplier) : [];
  } catch {
    return [];
  }
}

let addedSuppliers = readAddedSuppliers();

export function addSupplier(input: NewSupplierInput): TopRiskSupplier {
  const displayName = input.displayName.trim();
  const orgId = input.orgId.trim();
  const email = input.email.trim();
  if (!displayName || !orgId || !email) {
    throw new Error("Supplier name, Organization ID, and email are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (
    getTopRiskSuppliers().some(
      (supplier) => normalizeSupplierOrgId(supplier.orgId) === normalizeSupplierOrgId(orgId)
    )
  ) {
    throw new Error(DUPLICATE_SUPPLIER_ORG_ID_MESSAGE);
  }

  const supplier: TopRiskSupplier = {
    id: `sup-added-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayName,
    orgId,
    email,
    primaryContract: input.primaryContract?.trim() || "Not assigned",
    risk: "unassessed",
    mainIssue: "Awaiting compliance assessment.",
  };
  const nextSuppliers = [...addedSuppliers, supplier];
  localStorage.setItem(ADDED_SUPPLIERS_STORAGE_KEY, JSON.stringify(nextSuppliers));
  addedSuppliers = nextSuppliers;
  return supplier;
}

// Use the same supplier data and risk filter as the classification bar to keep both in sync
export function getSuppliersRequiringAttention(): TopRiskSupplier[] {
  return MODELED_SUPPLIERS.filter((s) => s.risk === "high" || s.risk === "medium").sort((a, b) => {
    if (a.risk === b.risk) return 0;
    return a.risk === "high" ? -1 : 1;
  });
}

// Recent alerts
// TODO: Add full alert details when the real alerts endpoint is available
// Fictional dates relative to today keep demo alert ages current without implying real activity.
function demoAlertCreatedAt(daysAgo: number): string {
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - daysAgo);
  return createdAt.toISOString();
}

const BULK_HIGH_ALERTS_UNLISTED = 0; // + 5 modeled high = 5 total
const BULK_MEDIUM_ALERTS_UNLISTED = 7; // + 7 modeled medium = 14 total
// Combined the unsupported "low" alerts into "medium" so the total stays consistent

let alerts: RecentAlert[] = [
  { id: "alert-1", severity: "high", title: "Vehicle deregistered according to Statens vegvesen", description: "Statens vegvesen data identifies a vehicle associated with this supplier as deregistered.", timeAgo: "20m ago", createdAt: demoAlertCreatedAt(0), status: "OPEN", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The vehicle is recorded as deregistered by Statens vegvesen.", supplierId: "sup-a" },
  { id: "alert-2", severity: "medium", title: "Environmental certificate has expired", description: "The supplier's ISO 14001 certificate has passed its recorded expiry date.", timeAgo: "3h ago", createdAt: demoAlertCreatedAt(1), status: "UNDER_REVIEW", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Document", name: "ISO 14001 certificate (DEMO-CERT-001)" }, reason: "The expiry date recorded for DEMO-CERT-001 has passed.", supplierId: "sup-b" },
  { id: "alert-3", severity: "high", title: "Vehicle is not in the approved vehicle list", description: "A vehicle in the supplier's statistics does not appear in the approved vehicle list.", timeAgo: "5h ago", createdAt: demoAlertCreatedAt(3), status: "IN_PROGRESS", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The vehicle appears in supplier statistics but is absent from the approved vehicle list.", supplierId: "sup-a" },
  { id: "alert-4", severity: "medium", title: "Required environmental certificate is missing", description: "The required Miljøfyrtårn certificate has not been submitted for this contract.", timeAgo: "Yesterday", createdAt: demoAlertCreatedAt(7), status: "OPEN", findingType: "MISSING_DOCUMENTATION", affectedItem: { type: "Document", name: "Miljøfyrtårn certificate" }, reason: "The existing certificate record has no submitted expiry date or certificate number.", supplierId: "sup-c" },
  { id: "alert-demo-1", severity: "high", title: "Vehicle is prohibited from use", description: "A vehicle associated with the supplier is recorded as prohibited from use.", timeAgo: "35m ago", createdAt: demoAlertCreatedAt(0), status: "OPEN", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The recorded vehicle status prohibits its use.", supplierId: "sup-d" },
  { id: "alert-demo-2", severity: "high", title: "Supplier has not fulfilled an energy commitment", description: "The latest mock energy report is below the existing minimum renewable-energy commitment.", timeAgo: "2h ago", createdAt: demoAlertCreatedAt(1), status: "UNDER_REVIEW", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Document", name: "Latest energy report" }, reason: "The report's renewable share is 62%, below the recorded 80% commitment.", supplierId: "sup-d" },
  { id: "alert-demo-3", severity: "high", title: "Unauthorized fossil-fuel vehicle is being used", description: "An unauthorized fossil-fuel vehicle is reported as being used by the supplier.", timeAgo: "6h ago", createdAt: demoAlertCreatedAt(3), status: "IN_PROGRESS", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The vehicle is reported as in use despite not being authorized.", supplierId: "sup-d" },
  // Available near-expiry demo certificate is an Eco-driving course, not an environmental certificate; retain its existing Medium risk.
  { id: "alert-demo-4", severity: "medium", title: "Certificate is approaching its expiry date", description: "The existing Eco-driving course certificate is within 30 days of its recorded expiry date.", timeAgo: "8h ago", createdAt: demoAlertCreatedAt(7), status: "IN_PROGRESS", findingType: "UPCOMING_EXPIRY", affectedItem: { type: "Document", name: "Eco-driving course certificate (DEMO-CERT-004)" }, reason: "The existing mock certificate record expires within 30 days.", supplierId: "sup-a" },
  { id: "alert-demo-5", severity: "medium", title: "Required environmental certificate is missing", description: "The required Miljøfyrtårn certificate has not been submitted for this contract.", timeAgo: "Yesterday", createdAt: demoAlertCreatedAt(14), status: "OPEN", findingType: "MISSING_DOCUMENTATION", affectedItem: { type: "Document", name: "Miljøfyrtårn certificate" }, reason: "The existing certificate record has no submitted expiry date or certificate number.", supplierId: "sup-c" },
  { id: "alert-demo-6", severity: "high", title: "Vehicle is prohibited from use", description: "A vehicle associated with the supplier is recorded as prohibited from use.", timeAgo: "Yesterday", createdAt: demoAlertCreatedAt(5), status: "UNDER_REVIEW", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The recorded vehicle status prohibits its use.", supplierId: "sup-d" },
  { id: "alert-demo-7", severity: "high", title: "Vehicle is not in the approved vehicle list", description: "A vehicle in the supplier's statistics does not appear in the approved vehicle list.", timeAgo: "2 days ago", createdAt: demoAlertCreatedAt(2), status: "OPEN", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The vehicle appears in supplier statistics but is absent from the approved vehicle list.", supplierId: "sup-a" },
  { id: "alert-demo-8", severity: "medium", title: "Environmental certificate has expired", description: "The supplier's ISO 14001 certificate has passed its recorded expiry date.", timeAgo: "3 days ago", createdAt: demoAlertCreatedAt(3), status: "UNDER_REVIEW", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Document", name: "ISO 14001 certificate (DEMO-CERT-001)" }, reason: "The expiry date recorded for DEMO-CERT-001 has passed.", supplierId: "sup-b" },
  { id: "alert-demo-9", severity: "high", title: "Vehicle is prohibited from use", description: "A previously flagged vehicle was prohibited from use; the issue is marked addressed in the demo workflow.", timeAgo: "4 days ago", createdAt: demoAlertCreatedAt(7), status: "RESOLVED", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Vehicle" }, reason: "The recorded vehicle status prohibited its use; the alert is resolved in this mock workflow.", supplierId: "sup-d" },
  { id: "alert-demo-10", severity: "high", title: "Supplier has not fulfilled an energy commitment", description: "The latest mock energy report is below the existing minimum renewable-energy commitment.", timeAgo: "5 days ago", createdAt: demoAlertCreatedAt(14), status: "UNDER_REVIEW", findingType: "CONFIRMED_DEVIATION", affectedItem: { type: "Document", name: "Latest energy report" }, reason: "The report's renewable share is 62%, below the recorded 80% commitment.", supplierId: "sup-d" },
];

export function getUnresolvedAlerts(): RecentAlert[] {
  return alerts.filter((alert) => alert.status !== "RESOLVED");
}

export function updateAlertStatus(id: string, status: RecentAlert["status"]): void {
  if (!alerts.some((alert) => alert.id === id)) {
    throw new Error(`Alert "${id}" was not found.`);
  }
  alerts = alerts.map((alert) => (alert.id === id ? { ...alert, status } : alert));
}

export function deleteAlert(id: string): void {
  const alertIndex = alerts.findIndex((alert) => alert.id === id);
  if (alertIndex === -1) {
    throw new Error(`Alert "${id}" was not found.`);
  }
  alerts = alerts.filter((alert) => alert.id !== id);
}

export function addManualAlert(input: NewManualAlertInput): RecentAlert {
  const title = input.title.trim();
  const description = input.description.trim();
  const supplier = getTopRiskSuppliers().find((item) => item.id === input.supplierId);
  if (!title || !description || !supplier || !input.findingType) {
    throw new Error("Alert title, type, description, and a valid supplier are required.");
  }

  const createdAt = new Date().toISOString();
  const alert: RecentAlert = {
    id: `alert-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    supplierId: supplier.id,
    category: input.category,
    severity: input.severity,
    findingType: input.findingType,
    dueDate: input.dueDate || undefined,
    source: "MANUAL",
    status: "OPEN",
    createdAt,
    timeAgo: "Just now",
  };
  alerts = [alert, ...alerts];
  return alert;
}

export function getAlertsBySeverity(): { high: number; medium: number; low: number } {
  const unresolved = getUnresolvedAlerts();
  const modeledHigh = unresolved.filter((alert) => alert.severity === "high").length;
  const modeledMedium = unresolved.filter((alert) => alert.severity === "medium").length;
  return {
    high: modeledHigh + BULK_HIGH_ALERTS_UNLISTED,
    medium: modeledMedium + BULK_MEDIUM_ALERTS_UNLISTED,
    low: unresolved.filter((alert) => alert.severity === "low").length,
  };
}

export function getUnresolvedAlertsCount(): number {
  const { high, medium, low } = getAlertsBySeverity();
  return high + medium + low;
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
  return getTopRiskSuppliers().map((s) => ({
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
    message: "Supplier and vehicle data were successfully synchronized",
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

import type { NewSupplierNote, SupplierNote } from "../types/dashboard";

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

// Notes saved before visibility existed are treated as INTERNAL notes with no known author.
let supplierNotes: SupplierNote[] = readStoredNotes().map((note) => ({
  ...note,
  authorId: note.authorId ?? "",
  visibility: note.visibility ?? "INTERNAL",
  alertId: note.alertId ?? null,
}));

// Mirrors the server: SELF notes go to their author only, INTERNAL notes to every admin.
export function getNotesForSupplier(supplierId: string, viewerId: string): SupplierNote[] {
  return supplierNotes
    .filter((n) => n.supplierId === supplierId && (n.visibility === "INTERNAL" || n.authorId === viewerId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addSupplierNote(
  supplierId: string,
  author: { id: string; name: string },
  input: NewSupplierNote
): SupplierNote {
  const note: SupplierNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    supplierId,
    authorId: author.id,
    authorName: author.name,
    visibility: input.visibility,
    text: input.text.trim(),
    alertId: input.alertId ?? null,
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

// Demo dates stay current; certificate status is derived from validUntil, not stored.
// Supplier B's mainIssue is manually aligned with cert-001, and certificate status does not affect supplier risk.
// TODO: Connect Mercell contract attachments and certification-body registries.
function isoDateFromToday(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const MOCK_CERTIFICATES: Certificate[] = [
  { id: "cert-001", standard: "iso-14001", certificateNumber: "DEMO-CERT-001", contractId: "sup-b", validUntil: isoDateFromToday(-14) },
  { id: "cert-002", standard: "gront-punkt-norge", certificateNumber: "DEMO-CERT-002", contractId: "sup-b", validUntil: isoDateFromToday(420) },
  { id: "cert-003", standard: "iso-14001", certificateNumber: "DEMO-CERT-003", contractId: "sup-a", validUntil: isoDateFromToday(310) },
  { id: "cert-004", standard: "eco-driving-course", certificateNumber: "DEMO-CERT-004", contractId: "sup-a", validUntil: isoDateFromToday(18) },
  { id: "cert-005", standard: "miljofyrtarn", certificateNumber: null, contractId: "sup-c", validUntil: null },
  { id: "cert-006", standard: "retura", certificateNumber: "DEMO-CERT-006", contractId: "sup-c", validUntil: isoDateFromToday(42) },
  { id: "cert-007", standard: "eco-driving-course", certificateNumber: "DEMO-CERT-007", contractId: "sup-d", validUntil: isoDateFromToday(150) },
  { id: "cert-008", standard: "emas", certificateNumber: "DEMO-CERT-008", contractId: "sup-d", validUntil: isoDateFromToday(520) },
  { id: "cert-009", standard: "iso-14001", certificateNumber: "DEMO-CERT-009", contractId: "sup-e", validUntil: isoDateFromToday(600) },
  { id: "cert-010", standard: "miljofyrtarn", certificateNumber: "DEMO-CERT-010", contractId: "sup-e", validUntil: isoDateFromToday(260) },
];

export function getCertificates(): Certificate[] {
  return MOCK_CERTIFICATES;
}

// Energy & fuel 
function latestCompletedQuarterLabel(now: Date = new Date()): string {
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1; // 1..4
  return currentQuarter === 1
    ? `Q4 ${now.getFullYear() - 1}`
    : `Q${currentQuarter - 1} ${now.getFullYear()}`;
}

const MOCK_ENERGY_PERIOD = latestCompletedQuarterLabel();

const MOCK_ENERGY_REQUIREMENTS: EnergyRequirement[] = [
  { contractId: "sup-a", minRenewableSharePercent: 50 },
  { contractId: "sup-c", minRenewableSharePercent: 80 },
  { contractId: "sup-d", minRenewableSharePercent: 80 },
];

const MOCK_ENERGY_RECORDS: EnergyRecord[] = [
  { id: "energy-001", contractId: "sup-a", period: MOCK_ENERGY_PERIOD, consumptionKwh: { electric: 180000, biogas: 110000, fossil: 210000 } },
  { id: "energy-002", contractId: "sup-c", period: MOCK_ENERGY_PERIOD, consumptionKwh: { electric: 0, biogas: 384000, fossil: 216000 } },
  { id: "energy-003", contractId: "sup-d", period: MOCK_ENERGY_PERIOD, consumptionKwh: { electric: 434000, biogas: 0, fossil: 266000 } },
];

export function getEnergyData(): EnergyData {
  return { requirements: MOCK_ENERGY_REQUIREMENTS, records: MOCK_ENERGY_RECORDS };
}

export function getAllAlerts(): RecentAlert[] {
  return alerts;
}