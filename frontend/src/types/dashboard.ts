export type RiskCategory = "high" | "medium" | "compliant";
export type AlertSeverity = "high" | "medium";
export type AlertStatus = "ACTIVE" | "DISMISSED";
export type SupplierIssueCategory = "VEHICLE_DEVIATION" | "CERTIFICATE_EXPIRY" | "FUEL_DEVIATION";

// TODO: Match this type with the backend response when the dashboard API is ready
export type DashboardKpis = {
  totalSuppliers: number;
  totalSuppliersDeltaThisMonth: number;
  highRiskSuppliers: number;
  monitoredSuppliers: number;
  activeAlerts: number;
  alertsBySeverity: { high: number; medium: number };
  complianceRatePercent: number;
  complianceTargetPercent: number;
};

export type RiskClassification = {
  compliant: { count: number; percent: number };
  medium: { count: number; percent: number };
  high: { count: number; percent: number };
};

export type TopRiskSupplier = {
  id: string;
  // Keep supplier names anonymous on the overview; show full details on the supplier pages
  displayName: string;
  orgId: string;
  primaryContract: string;
  risk: RiskCategory;
  mainIssue: string;
  // Set the issue only for high/medium-risk suppliers
  issueCategory?: SupplierIssueCategory;
};

export type RecentAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  timeAgo: string;
  status: AlertStatus;
  dismissedAt?: string;
  dismissedBy?: string;
  // Set only when the alert clearly matches a supplier issue in the mock data
  supplierId?: string;
};

export type DashboardSummary = {
  lastSyncedAt: string;
  kpis: DashboardKpis;
  riskClassification: RiskClassification;
  topRiskSuppliers: TopRiskSupplier[];
  suppliersRequiringAttention: TopRiskSupplier[];
  recentAlerts: RecentAlert[];
};