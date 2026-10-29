import type { EnergyRow, EnergyTableRow, MissingEnergyRow } from "./EnergyTable";
import { formatKwh, formatPercent } from "../../types/energy";
import type { EnergyComplianceStatus } from "../../types/energy";

export type EnergyStatusFilter = "all" | "compliant" | "non-compliant" | "missing-data";

export const ENERGY_STATUS_FILTERS: { value: EnergyStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "compliant", label: "Compliant" },
  { value: "non-compliant", label: "Non-compliant" },
  { value: "missing-data", label: "Missing data" },
];

export function getEnergyStatusLabel(status: EnergyComplianceStatus): string {
  return status === "compliant" ? "Compliant" : "Non-compliant";
}

export function getEnergyAttentionRows(rows: readonly EnergyRow[]): EnergyRow[] {
  return rows.filter(({ analysis }) => analysis.status !== "compliant");
}

export function getEnergyNoticeReason(row: EnergyRow): string | null {
  if (row.analysis.status === "compliant") return null;
  const fossilIssue =
    row.analysis.fossilExcessKwh > 0
      ? `\nReported fossil energy exceeds its contract limit by ${formatKwh(row.analysis.fossilExcessKwh)}.`
      : "";
  return `Reported renewable energy share is ${formatPercent(row.analysis.renewableSharePercent)}, below the contract minimum of ${formatPercent(row.requirement.minRenewableSharePercent)} by ${row.analysis.shortfallPoints.toFixed(1)} percentage points.${fossilIssue}`;
}

export function getEnergySuggestedNoticeMessage(row: EnergyRow): string | null {
  if (row.analysis.status === "compliant") return null;

  const contractContext = row.contract ? ` for ${row.contract.contractName}` : "";
  const reportingPeriod = row.record.period ? ` during ${row.record.period}` : "";
  const fossilContext =
    row.analysis.fossilExcessKwh > 0
      ? ` The reported fuel mix also exceeds the fossil-energy limit by ${formatKwh(row.analysis.fossilExcessKwh)}.`
      : "";
  return `Please review the reported renewable energy share of ${formatPercent(row.analysis.renewableSharePercent)} against the contract minimum of ${formatPercent(row.requirement.minRenewableSharePercent)}${contractContext}${reportingPeriod} and provide an update on any corrective actions planned.${fossilContext}`;
}

export function filterEnergyRows(
  rows: readonly EnergyRow[],
  missingRows: readonly MissingEnergyRow[],
  status: EnergyStatusFilter,
  search: string
): EnergyTableRow[] {
  const query = search.trim().toLowerCase();
  const matchesSearch = (row: EnergyTableRow) =>
    query.length === 0 ||
    (row.contract?.supplierName.toLowerCase().includes(query) ?? false) ||
    (row.contract?.supplierOrgId.toLowerCase().includes(query) ?? false) ||
    (row.contract?.contractName.toLowerCase().includes(query) ?? false);
  const matchingRecords = rows.filter(({ analysis }) => {
    if (status === "all") return true;
    if (status === "compliant") return analysis.status === "compliant";
    if (status === "non-compliant") return analysis.status !== "compliant";
    return false;
  });
  const matchingMissing = status === "all" || status === "missing-data" ? missingRows : [];
  return [...matchingRecords, ...matchingMissing].filter(matchesSearch);
}
