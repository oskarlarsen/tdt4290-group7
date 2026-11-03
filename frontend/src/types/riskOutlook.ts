import {
  CERTIFICATE_STANDARD_LABELS,
  formatCertificateDate,
  getCertificateStatus,
} from "./certificate";
import { analyzeEnergy, formatPercent, getTotalKwh } from "./energy";
import type { Certificate } from "./certificate";
import type { DerivedContract } from "./contract";
import type { EnergyData } from "./energy";

export type RiskPriority = "high" | "medium" | "low" | "none";
export type RiskIndicatorCategory = "vehicle" | "energy" | "certificate";
// active: already occurring. predicted: a known future date. data-gap: required data missing.
export type RiskIndicatorKind = "active" | "predicted" | "data-gap";
export type RiskTone = "red" | "orange" | "yellow" | "tertiary";

export const RISK_PRIORITY_INFO: Record<
  RiskPriority,
  { label: string; tone: RiskTone; rank: number }
> = {
  high: { label: "High", tone: "red", rank: 0 },
  medium: { label: "Medium", tone: "orange", rank: 1 },
  low: { label: "Low", tone: "yellow", rank: 2 },
  none: { label: "No indicators", tone: "tertiary", rank: 3 },
};

export const RISK_INDICATOR_KIND_LABELS: Record<RiskIndicatorKind, string> = {
  active: "Active deviation",
  predicted: "Predicted",
  "data-gap": "Data not submitted",
};

export type RiskIndicator = {
  id: string;
  contractId: string;
  category: RiskIndicatorCategory;
  kind: RiskIndicatorKind;
  priority: Exclude<RiskPriority, "none">;
  title: string;
  detail: string;
  date: string | null; // ISO: projected breach date, or the date a certificate lapsed
  daysUntil: number | null; // only set for predicted indicators
};

export type RiskOutlookRow = {
  contract: DerivedContract;
  indicators: RiskIndicator[]; // most urgent first
  priority: RiskPriority; // the highest indicator priority, or "none"
  primary: RiskIndicator | null;
  nextProjected: RiskIndicator | null; // soonest predicted indicator
};

const PRIORITY_RANK: Record<Exclude<RiskPriority, "none">, number> = { high: 0, medium: 1, low: 2 };
const CATEGORY_ORDER: Record<RiskIndicatorCategory, number> = { vehicle: 0, energy: 1, certificate: 2 };

function compareIndicators(a: RiskIndicator, b: RiskIndicator): number {
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  }
  if (a.daysUntil !== null && b.daysUntil !== null && a.daysUntil !== b.daysUntil) {
    return a.daysUntil - b.daysUntil;
  }
  if (CATEGORY_ORDER[a.category] !== CATEGORY_ORDER[b.category]) {
    return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  }
  return a.id.localeCompare(b.id);
}

function compareRows(a: RiskOutlookRow, b: RiskOutlookRow): number {
  const rankA = RISK_PRIORITY_INFO[a.priority].rank;
  const rankB = RISK_PRIORITY_INFO[b.priority].rank;
  if (rankA !== rankB) return rankA - rankB;
  const daysA = a.nextProjected?.daysUntil ?? null;
  const daysB = b.nextProjected?.daysUntil ?? null;
  if (daysA !== daysB) {
    if (daysA === null) return 1;
    if (daysB === null) return -1;
    return daysA - daysB;
  }
  return a.contract.supplierName.localeCompare(b.contract.supplierName);
}

export function formatDaysUntil(days: number): string {
  if (days === 0) return "today";
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

export function formatDaysValue(days: number): string {
  if (days === 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

export function formatProjectedBreach(indicator: RiskIndicator): string {
  if (!indicator.date || indicator.daysUntil === null) return indicator.title;
  return `${indicator.title} on ${formatCertificateDate(indicator.date)} (${formatDaysUntil(indicator.daysUntil)})`;
}

// Risk levels follow customer priorities; expiry predictions use a 180-day horizon.
// TODO: Replace client-side logic with a backend risk and prediction service.
export function buildRiskOutlook(
  input: { contracts: DerivedContract[]; certificates: Certificate[]; energy: EnergyData },
  now: Date = new Date()
): RiskOutlookRow[] {
  const { contracts, certificates, energy } = input;
  const requirementByContract = new Map(energy.requirements.map((r) => [r.contractId, r]));
  const recordByContract = new Map(energy.records.map((r) => [r.contractId, r]));

  const rows = contracts.map<RiskOutlookRow>((contract) => {
    const indicators: RiskIndicator[] = [];

    // Vehicles (counts are derived in mocks/db.ts from the vehicle records)
    if (
      contract.vehicleMonitoring === "monitored" &&
      contract.flaggedVehicleCount !== undefined &&
      contract.flaggedVehicleCount > 0
    ) {
      const vehicleCountDetail =
        contract.vehicleCount === undefined
          ? ""
          : ` of ${contract.vehicleCount} tracked vehicle${contract.vehicleCount === 1 ? "" : "s"}`;
      indicators.push({
        id: `vehicle-${contract.id}`,
        contractId: contract.id,
        category: "vehicle",
        kind: "active",
        priority: "high",
        title: "Vehicle deviations",
        detail: `${contract.flaggedVehicleCount}${vehicleCountDetail} flagged (not on the approved list, or deregistered, prohibited or exported).`,
        date: null,
        daysUntil: null,
      });
    } else if (contract.vehicleMonitoring === "data-missing") {
      indicators.push({
        id: `vehicle-${contract.id}`,
        contractId: contract.id,
        category: "vehicle",
        kind: "data-gap",
        priority: "medium",
        title: "Vehicle data not submitted",
        detail: "This contract involves vehicles, but no vehicle data has been submitted, so deviations can't be checked",
        date: null,
        daysUntil: null,
      });
    }

    // Energy
    const requirement = requirementByContract.get(contract.id);
    if (requirement) {
      const record = recordByContract.get(contract.id);
      if (!record || getTotalKwh(record.consumptionKwh) <= 0) {
        indicators.push({
          id: `energy-${contract.id}`,
          contractId: contract.id,
          category: "energy",
          kind: "data-gap",
          priority: "medium",
          title: "Energy data not submitted",
          detail: "This contract has an energy requirement, but no consumption data has been submitted, so compliance can't be checked",
          date: null,
          daysUntil: null,
        });
      } else {
        const analysis = analyzeEnergy(record, requirement);
        if (analysis.status !== "compliant") {
          const isBreach = analysis.status === "breach";
          indicators.push({
            id: `energy-${contract.id}`,
            contractId: contract.id,
            category: "energy",
            kind: "active",
            priority: isBreach ? "high" : "medium",
            title: isBreach ? "Energy breach" : "Minor energy deviation",
            detail: `Renewable share was ${formatPercent(analysis.renewableSharePercent)} in ${record.period}, ${analysis.shortfallPoints.toFixed(1)} percentage points below the contract minimum of ${formatPercent(requirement.minRenewableSharePercent)}.`,
            date: null,
            daysUntil: null,
          });
        }
      }
    }

    // Certificates
    for (const certificate of certificates) {
      if (certificate.contractId !== contract.id) continue;
      const info = getCertificateStatus(certificate, now);
      const label = CERTIFICATE_STANDARD_LABELS[certificate.standard];

      if (info.status === "expired" && certificate.validUntil) {
        const ago = Math.abs(info.daysRemaining ?? 0);
        indicators.push({
          id: `cert-${certificate.id}`,
          contractId: contract.id,
          category: "certificate",
          kind: "active",
          priority: "medium",
          title: `${label} expired`,
          detail: `Expired on ${formatCertificateDate(certificate.validUntil)} (${ago} day${ago === 1 ? "" : "s"} ago).`,
          date: certificate.validUntil,
          daysUntil: null,
        });
      } else if (info.status === "missing-documentation") {
        indicators.push({
          id: `cert-${certificate.id}`,
          contractId: contract.id,
          category: "certificate",
          kind: "active",
          priority: "medium",
          title: `${label}: documentation missing`,
          detail: "Required by the contract, but no certificate documentation has been submitted",
          date: null,
          daysUntil: null,
        });
      } else if (
        (info.status === "critical" || info.status === "expiring") &&
        certificate.validUntil &&
        info.daysRemaining !== null
      ) {
        indicators.push({
          id: `cert-${certificate.id}`,
          contractId: contract.id,
          category: "certificate",
          kind: "predicted",
          priority: "low",
          title: `${label} expiring`,
          detail: `Expires on ${formatCertificateDate(certificate.validUntil)} (${formatDaysUntil(info.daysRemaining)}).`,
          date: certificate.validUntil,
          daysUntil: info.daysRemaining,
        });
      }
    }

    indicators.sort(compareIndicators);
    const primary = indicators[0] ?? null;
    const nextProjected =
      indicators
        .filter((i) => i.kind === "predicted" && i.daysUntil !== null)
        .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0))[0] ?? null;

    return {
      contract,
      indicators,
      priority: primary ? primary.priority : "none",
      primary,
      nextProjected,
    };
  });

  return rows.sort(compareRows);
}

export type RiskOutlookSummary = {
  total: number;
  counts: Record<RiskPriority, number>;
  predictedContracts: number;
  predictedIndicators: number;
  earliest: { row: RiskOutlookRow; indicator: RiskIndicator } | null;
};

export function summarizeRiskOutlook(rows: RiskOutlookRow[]): RiskOutlookSummary {
  const counts: Record<RiskPriority, number> = { high: 0, medium: 0, low: 0, none: 0 };
  let predictedContracts = 0;
  let predictedIndicators = 0;
  let earliest: RiskOutlookSummary["earliest"] = null;

  for (const row of rows) {
    counts[row.priority] += 1;
    const predicted = row.indicators.filter((i) => i.kind === "predicted");
    predictedIndicators += predicted.length;
    if (predicted.length > 0) predictedContracts += 1;

    const next = row.nextProjected;
    if (next && next.daysUntil !== null) {
      if (earliest === null || next.daysUntil < (earliest.indicator.daysUntil ?? Infinity)) {
        earliest = { row, indicator: next };
      }
    }
  }

  return { total: rows.length, counts, predictedContracts, predictedIndicators, earliest };
}