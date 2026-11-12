import { ENERGY_STATUS_LABELS, ENERGY_STATUS_RANK, formatKwh, formatSignedKwh } from "../../types/energy";
import type { EnergyContract, EnergyStatus } from "../../types/energy";

export type EnergyStatusFilter = "all" | EnergyStatus;

export const ENERGY_STATUS_FILTERS: { value: EnergyStatusFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  ...(["NON_COMPLIANT", "AT_RISK", "COMPLIANT", "MISSING_DATA", "NO_COMMITMENT"] as const).map((value) => ({
    value,
    label: ENERGY_STATUS_LABELS[value],
  })),
];

export type EnergySortKey = "supplier" | "status";
export type EnergySortDirection = "asc" | "desc";

export function filterEnergy(rows: readonly EnergyContract[], status: EnergyStatusFilter, search: string): EnergyContract[] {
  const query = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      (query.length === 0 ||
        row.supplierName.toLowerCase().includes(query) ||
        row.orgNumber.toLowerCase().includes(query) ||
        (row.saksnr ?? "").toLowerCase().includes(query))
  );
}

// "status" sorts most urgent first when ascending. Ties fall back to the supplier name so the order is stable.
export function sortEnergy(rows: readonly EnergyContract[], key: EnergySortKey, direction: EnergySortDirection): EnergyContract[] {
  const byName = (a: EnergyContract, b: EnergyContract) => a.supplierName.localeCompare(b.supplierName) || a.agreementId.localeCompare(b.agreementId);
  const compare =
    key === "supplier"
      ? byName
      : (a: EnergyContract, b: EnergyContract) => ENERGY_STATUS_RANK[a.status] - ENERGY_STATUS_RANK[b.status] || byName(a, b);
  const sorted = [...rows].sort(compare);
  return direction === "asc" ? sorted : sorted.reverse();
}

export function getEnergyAttentionRows(rows: readonly EnergyContract[]): EnergyContract[] {
  return sortEnergy(rows.filter((row) => row.status === "NON_COMPLIANT" || row.status === "AT_RISK"), "status", "asc");
}

function shortfalls(row: EnergyContract): string[] {
  const issues: string[] = [];
  if (row.commitment && row.selfProducedDeviationKwh !== null && row.selfProducedDeviationKwh < 0) {
    issues.push(`egenprodusert fornybar energi er ${formatKwh(-row.selfProducedDeviationKwh)} under forpliktelsen på ${formatKwh(row.commitment.minSelfProducedKwh)}`);
  }
  if (row.commitment && row.gooDeviationKwh !== null && row.gooDeviationKwh < 0) {
    issues.push(`energi dekket av opprinnelsesgarantier (GoO) er ${formatKwh(-row.gooDeviationKwh)} under minimumet på ${formatKwh(row.commitment.minGooKwh)}`);
  }
  return issues;
}

export function getEnergyNoticeReason(row: EnergyContract): string | null {
  if (row.status !== "NON_COMPLIANT" && row.status !== "AT_RISK") return null;
  const outlook = row.status === "AT_RISK" ? "Med nåværende tempo: " : "For " + row.year + ": ";
  const issues = shortfalls(row);
  return `${outlook}${issues.join(" og ")}.`;
}

export function getEnergySuggestedNoticeMessage(row: EnergyContract): string | null {
  const reason = getEnergyNoticeReason(row);
  if (!reason) return null;
  const contract = row.saksnr ? ` for avtale ${row.saksnr}` : "";
  return `Vennligst gjennomgå energirapporteringen din${contract} for ${row.year}. ${reason} Dokumenter avviket og fortell oss hvilke tiltak du planlegger, inkludert eventuelle opprinnelsesgarantier du vil sikre.`;
}

export { formatSignedKwh };
