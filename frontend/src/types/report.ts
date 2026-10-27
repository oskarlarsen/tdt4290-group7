export type ReportId =
  | "suppliers"
  | "contracts"
  | "vehicles"
  | "certificates"
  | "energy"
  | "risk-outlook"
  | "alerts";

export type ReportCategory = "suppliers-contracts" | "monitoring" | "risk-alerts";
export const VEHICLE_REPORT_LIMIT = 25;
export type ReportStatus = "drafting" | "published" | "under-review" | "scheduled";

// One CSV row. Matches the shape utils/csv.ts's toCsv() accepts.
export type ReportRow = Record<string, string | number>;

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  "suppliers-contracts": "Suppliers & contracts",
  monitoring: "Monitoring",
  "risk-alerts": "Risk & alerts",
};

export type ReportDefinition = {
  id: ReportId;
  title: string;
  description: string;
  category: ReportCategory;
  unit: string; // singular noun for the record count, e.g. "vehicle"
  scopeNote: string;
  sourceLabel: string; // the page the data comes from
  sourcePath: string;
  status: ReportStatus;
  generatedDueAt?: string | null;
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  drafting: "Drafting",
  published: "Published",
  "under-review": "Under Review",
  scheduled: "Scheduled",
};

// These stable lifecycle labels are fictional demo metadata, not a connected workflow.
// The reports themselves are generated from the existing data sources below.
// Statutory filings, council packages and official submissions are NOT listed,
// because nothing in the project supports them.
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "suppliers",
    title: "Supplier directory",
    description: "Each supplier's contract, risk level and main issue.",
    category: "suppliers-contracts",
    unit: "supplier",
    scopeNote: "Suppliers with full records only",
    sourceLabel: "Suppliers",
    sourcePath: "/admin/suppliers",
    status: "published",
  },
  {
    id: "contracts",
    title: "Contracts register",
    description: "Contracts with status, start and end dates and environmental compliance.",
    category: "suppliers-contracts",
    unit: "contract",
    scopeNote: "Contracts with full records only",
    sourceLabel: "Contracts",
    sourcePath: "/admin/contracts",
    status: "under-review",
  },
  {
    id: "vehicles",
    title: "Vehicle compliance",
    description: "Listed vehicles with supplier ID, agreement dates and latest check findings.",
    category: "monitoring",
    unit: "vehicle",
    scopeNote: `Up to ${VEHICLE_REPORT_LIMIT} listed registered vehicles; pending registrations excluded`,
    sourceLabel: "Vehicles",
    sourcePath: "/admin/vehicles",
    status: "drafting",
  },
  {
    id: "certificates",
    title: "Environmental certificates",
    description: "Certificates with standard, number, validity date and calculated status.",
    category: "monitoring",
    unit: "certificate",
    scopeNote: "Contracts with certificate records",
    sourceLabel: "Environmental Certificates",
    sourcePath: "/admin/certificates",
    status: "published",
  },
  {
    id: "energy",
    title: "Energy & fuel compliance",
    description: "Energy and fuel mix per contract against its minimum renewable share.",
    category: "monitoring",
    unit: "contract",
    scopeNote: "Contracts with an energy requirement and submitted data",
    sourceLabel: "Energy & Fuel",
    sourcePath: "/admin/energy",
    status: "scheduled",
  },
  {
    id: "risk-outlook",
    title: "Risk outlook",
    description: "Risk indicators per contract in priority order, with projected certificate breaches.",
    category: "risk-alerts",
    unit: "contract",
    scopeNote: "Contracts with full records only",
    sourceLabel: "Risk & Prediction",
    sourcePath: "/admin/risk",
    status: "under-review",
  },
  {
    id: "alerts",
    title: "Alerts log",
    description: "All alerts, active and dismissed, with severity, linked supplier and dismissal details.",
    category: "risk-alerts",
    unit: "alert",
    scopeNote: "Alerts with full records, active and dismissed",
    sourceLabel: "Alerts",
    sourcePath: "/admin/alerts",
    status: "drafting",
  },
];

export function formatReportScope(definition: ReportDefinition, count: number): string {
  return `${count} ${definition.unit}${count === 1 ? "" : "s"}`;
}
