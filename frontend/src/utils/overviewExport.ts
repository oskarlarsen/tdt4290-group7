import type { AlertCategory, DashboardSummary, RecentAlert, SupplierIssueCategory } from "../types/dashboard";

export const OVERVIEW_COLUMNS = [
  "Section", "Supplier", "Name", "Agreement", "Risk / Severity", "Status", "Category", "Detail", "Due date", "Value",
] as const;

type Row = Partial<Record<(typeof OVERVIEW_COLUMNS)[number], string | number>>;

const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  ENVIRONMENTAL_COMPLIANCE: "Environmental compliance",
  ENERGY_FUEL: "Energy & fuel",
  VEHICLE_COMPLIANCE: "Vehicle compliance",
  CERTIFICATES: "Certificates",
};

const ALERT_STATUS_LABELS: Record<RecentAlert["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
};

const ISSUE_LABELS: Record<SupplierIssueCategory, string> = {
  VEHICLE_DEVIATION: "Vehicle deviation",
  CERTIFICATE_EXPIRY: "Certificate expiry",
  FUEL_DEVIATION: "Fuel/energy deviation",
};

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Rows for the one-sheet overview report: the summary metrics, then the suppliers, alerts and deviations behind them.
 * An unresolved vehicle alert is a deviation, so it is listed twice, once per section.
 */
export function buildOverviewRows(data: DashboardSummary, alerts: RecentAlert[]): Row[] {
  const { kpis, riskClassification } = data;
  const supplierById = new Map(data.topRiskSuppliers.map((supplier) => [supplier.id, supplier]));
  const metric = (name: string, value: number): Row => ({ Section: "Metric", Name: name, Value: value });

  const rows: Row[] = [
    metric("Active suppliers", kpis.totalSuppliers),
    metric("Active agreements", kpis.activeAgreements),
    metric("Listed vehicles", kpis.listedVehicles),
    metric("Certificates tracked", kpis.certificatesTracked),
    metric("High-risk suppliers", kpis.highRiskSuppliers),
    metric("Unresolved alerts", kpis.activeAlerts),
    metric("Suppliers with no flagged evidence (%)", kpis.complianceRatePercent),
    metric("Suppliers with no flagged evidence", riskClassification.compliant.count),
    metric("Medium-risk suppliers", riskClassification.medium.count),
    metric("High-risk suppliers (classification)", riskClassification.high.count),
    metric("Suppliers not assessed", riskClassification.unassessed.count),
    metric("Assessed suppliers", kpis.assessedSuppliers),
  ];

  for (const supplier of data.topRiskSuppliers.filter((s) => s.risk === "high")) {
    const categories = supplier.issueCategories ?? (supplier.issueCategory ? [supplier.issueCategory] : []);
    rows.push({
      Section: "High-risk supplier",
      Supplier: supplier.displayName,
      Agreement: supplier.primaryContract,
      "Risk / Severity": "High",
      Status: (supplier.onboardingStatus ?? "INVITED").replace(/_/g, " ").toLowerCase(),
      Category: categories.map((category) => ISSUE_LABELS[category]).join(", "),
      Detail: supplier.mainIssue,
    });
  }

  const alertRow = (section: string, alert: RecentAlert): Row => {
    const supplier = alert.supplierId ? supplierById.get(alert.supplierId) : undefined;
    return {
      Section: section,
      Supplier: supplier?.displayName,
      Name: alert.title,
      Agreement: supplier?.primaryContract,
      "Risk / Severity": capitalise(alert.severity),
      Status: ALERT_STATUS_LABELS[alert.status],
      Category: alert.category ? ALERT_CATEGORY_LABELS[alert.category] : undefined,
      Detail: alert.description,
      "Due date": alert.dueDate,
    };
  };

  const unresolved = alerts.filter((alert) => alert.status !== "RESOLVED");
  rows.push(...unresolved.map((alert) => alertRow("Unresolved alert", alert)));
  rows.push(...unresolved.filter((alert) => alert.category === "VEHICLE_COMPLIANCE").map((alert) => alertRow("Deviation", alert)));
  return rows;
}
