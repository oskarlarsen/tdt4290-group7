import type { RiskCategory } from "./risk";

export type ContractStatus = "Active" | "Expiring Soon" | "Expired";

// DerivedContract rows are built from supplier data, with demo-only contract fields
// Risk remains the supplier's real risk; the compliance label is a plain-language version of that same value
export type DerivedContract = {
  id: string;
  contractName: string;
  supplierId: string;
  supplierName: string;
  supplierOrgId: string;
  risk: RiskCategory;
  mainIssue: string;
  environmentalGoal?: number | null;
  environmentalActual?: number | null;
  vehicleMonitoring?: "monitored" | "data-missing";
  vehicleCount?: number;
  flaggedVehicleCount?: number;
  status: ContractStatus;
  startDate: string; // ISO date — mock value, see mocks/db.ts
  endDate: string; // ISO date — mock value, see mocks/db.ts
  documentUrl: string | null; // path to a mock PDF, or null if unavailable
};

const COMPLIANCE_LABELS: Record<RiskCategory, string> = {
  compliant: "Compliant",
  medium: "Under review",
  high: "Non-compliant",
};

// Pure relabeling of the real `risk` field for contract-facing
// language — never an independently stored/assessed value.
export function getEnvironmentalComplianceLabel(risk: RiskCategory): string {
  return COMPLIANCE_LABELS[risk];
}