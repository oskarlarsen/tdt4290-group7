import type { RiskCategory } from "./risk";
export type { RiskCategory } from "./risk";

export type AlertSeverity = "high" | "medium" | "low";
export const ALERT_STATUSES = ["OPEN", "IN_PROGRESS", "UNDER_REVIEW", "RESOLVED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_CATEGORIES = [
  "ENVIRONMENTAL_COMPLIANCE",
  "ENERGY_FUEL",
  "VEHICLE_COMPLIANCE",
  "CERTIFICATES",
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];
export type AlertSource = "MANUAL" | "AUTOMATIC";
export type AlertFindingType =
  | "CONFIRMED_DEVIATION"
  | "MISSING_DOCUMENTATION"
  | "UPCOMING_EXPIRY";
export type SupplierIssueCategory = "VEHICLE_DEVIATION" | "CERTIFICATE_EXPIRY" | "FUEL_DEVIATION";
export type SupplierRisk = RiskCategory | "unassessed";
export type SupplierOnboardingStatus =
  | "INVITED"
  | "PROFILE_PENDING"
  | "DATA_DRAFT"
  | "VALIDATING"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REVISION_REQUIRED";
export type NewSupplierInput = {
  displayName: string;
  orgId: string;
  email: string;
  primaryContract?: string;
};

export type AdminDashboardAgreement = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierOrgNumber: string;
  note: string;
  startDate: string;
  endDate: string;
  allowedVehicles: number;
  listedVehicles: number;
};

export type AdminDashboardSummary = {
  generatedAt: string;
  activeSuppliers: number;
  activeAgreements: number;
  listedVehicles: number;
  certificatesTracked: number;
  expiredCertificates: number;
  certificatesExpiringWithin90Days: number;
  agreements: AdminDashboardAgreement[];
};

export type DashboardKpis = {
  totalSuppliers: number;
  totalSuppliersDeltaThisMonth: number;
  highRiskSuppliers: number;
  monitoredSuppliers: number;
  activeAlerts: number;
  alertsBySeverity: { high: number; medium: number };
  complianceRatePercent: number;
  complianceTargetPercent: number;
  assessedSuppliers: number;
  activeAgreements: number;
  listedVehicles: number;
  certificatesTracked: number;
  expiredCertificates: number;
  certificatesExpiringWithin90Days: number;
};

export type RiskClassification = {
  compliant: { count: number; percent: number };
  medium: { count: number; percent: number };
  high: { count: number; percent: number };
  // Suppliers with no stored vehicle check or dated certificate. Percentages are of all suppliers.
  unassessed: { count: number; percent: number };
};

export type UnmodeledSupplierAggregate = {
  totalSuppliers: number;
  highRiskSuppliers: number;
  mediumRiskSuppliers: number;
};

export type SupplierPortfolioSummary = {
  monitoredSuppliers: number;
  renewedThisMonthCount: number;
  riskClassification: RiskClassification;
};

export type TopRiskSupplier = {
  id: string;
  // Keep supplier names anonymous on the overview; show full details on the supplier pages
  displayName: string;
  orgId: string;
  email?: string;
  primaryContract: string;
  risk: SupplierRisk;
  mainIssue: string;
  // Set the issue only for high/medium-risk suppliers
  issueCategory?: SupplierIssueCategory;
  // Every category that applies; older responses only have issueCategory.
  issueCategories?: SupplierIssueCategory[];
  onboardingStatus?: SupplierOnboardingStatus;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  reviewerNotes?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  agreementCount?: number;
  vehicleCount?: number;
  certificateCount?: number;
  energyRecordCount?: number;
  productCount?: number;
  registeredAccountCount?: number;
};

export type RecentAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  timeAgo: string;
  createdAt?: string;
  status: AlertStatus;
  category?: AlertCategory;
  source?: AlertSource;
  dueDate?: string;
  findingType?: AlertFindingType;
  affectedItem?: {
    type: "Vehicle" | "Document";
    name?: string;
  };
  reason?: string;
  // Set only when the alert clearly matches a supplier issue in the mock data
  supplierId?: string;
};

export type NewManualAlertInput = {
  title: string;
  supplierId: string;
  category: AlertCategory;
  severity: AlertSeverity;
  findingType: AlertFindingType;
  description: string;
  dueDate?: string;
};

export type IssueCategoryBreakdown = {
  vehicleDeviation: number;
  certificateExpiry: number;
  fuelDeviation: number | null;
  // Counts use suppliers with persisted assessment evidence.
  modeledSupplierCount: number;
};

export type SupplierNote = {
  id: string;
  supplierId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type DashboardSummary = {
  lastSyncedAt: string;
  kpis: DashboardKpis;
  riskClassification: RiskClassification;
  topRiskSuppliers: TopRiskSupplier[];
  suppliersRequiringAttention: TopRiskSupplier[];
  issueCategoryBreakdown: IssueCategoryBreakdown;
  recentAlerts: RecentAlert[];
};