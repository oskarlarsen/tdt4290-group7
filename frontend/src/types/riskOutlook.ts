import {
  CERTIFICATE_STANDARD_LABELS,
  formatCertificateDate,
  getCertificateStatus,
} from "./certificate";
import { formatSignedKwh } from "./energy";
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
  high: { label: "Høy", tone: "red", rank: 0 },
  medium: { label: "Middels", tone: "orange", rank: 1 },
  low: { label: "Lav", tone: "yellow", rank: 2 },
  none: { label: "Ingen indikatorer", tone: "tertiary", rank: 3 },
};

export const RISK_INDICATOR_KIND_LABELS: Record<RiskIndicatorKind, string> = {
  active: "Aktivt avvik",
  predicted: "Predikert",
  "data-gap": "Data ikke innsendt",
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

/** Points per finding priority; keep in step with the backend (AdminDashboardRoutes.kt). */
const RISK_POINTS = { high: 10, medium: 4, low: 1 } as const;
const HIGH_RISK_SCORE = 10;
const MEDIUM_RISK_SCORE = 4;

export type RiskOutlookRow = {
  /** Total points of all indicators; the row's priority is derived from it. */
  score: number;
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
  if (days === 0) return "i dag";
  return days === 1 ? "om 1 dag" : `om ${days} dager`;
}

export function formatDaysValue(days: number): string {
  if (days === 0) return "I dag";
  return days === 1 ? "1 dag" : `${days} dager`;
}

export function formatProjectedBreach(indicator: RiskIndicator): string {
  if (!indicator.date || indicator.daysUntil === null) return indicator.title;
  return `${indicator.title} den ${formatCertificateDate(indicator.date)} (${formatDaysUntil(indicator.daysUntil)})`;
}

// Risk levels follow customer priorities; expiry predictions use a 180-day horizon.
// TODO: Replace client-side logic with a backend risk and prediction service.
export function buildRiskOutlook(
  input: { contracts: DerivedContract[]; certificates: Certificate[]; energy: EnergyData },
  now: Date = new Date()
): RiskOutlookRow[] {
  const { contracts, certificates, energy } = input;
  const energyByContract = new Map(energy.map((row) => [row.agreementId, row]));

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
          : ` av ${contract.vehicleCount} overvåkede kjøretøy`;
      indicators.push({
        id: `vehicle-${contract.id}`,
        contractId: contract.id,
        category: "vehicle",
        kind: "active",
        priority: "high",
        title: "Kjøretøyavvik",
        detail: `${contract.flaggedVehicleCount}${vehicleCountDetail} markert (ikke på den godkjente kjøretøylisten, eller avregistrert, med bruksforbud eller eksportert).`,
        date: null,
        daysUntil: null,
      });
    } else if (contract.vehicleMonitoring === "data-missing") {
      indicators.push({
        id: `vehicle-${contract.id}`,
        contractId: contract.id,
        category: "vehicle",
        kind: "data-gap",
        priority: "low",
        title: "Kjøretøydata ikke innsendt",
        detail: "Avtalen omfatter kjøretøy, men ingen kjøretøydata er sendt inn, så avvik kan ikke kontrolleres",
        date: null,
        daysUntil: null,
      });
    }

    // Energy. Only contracts that require energy reporting have a summary.
    const energyRow = energyByContract.get(contract.id);
    if (energyRow?.status === "MISSING_DATA") {
      indicators.push({
        id: `energy-${contract.id}`,
        contractId: contract.id,
        category: "energy",
        kind: "data-gap",
        priority: "low",
        title: "Energidata ikke innsendt",
        detail: "Avtalen har et energikrav, men ingen energirapport er sendt inn, så avvik ikke kan kontrolleres",
        date: null,
        daysUntil: null,
      });
    } else if (energyRow?.status === "NON_COMPLIANT" || energyRow?.status === "AT_RISK") {
      const isBreach = energyRow.status === "NON_COMPLIANT";
      const shortfalls = [
        energyRow.selfProducedDeviationKwh !== null && energyRow.selfProducedDeviationKwh < 0
          ? `egenprodusert fornybar energi ${formatSignedKwh(energyRow.selfProducedDeviationKwh)}`
          : null,
        energyRow.gooDeviationKwh !== null && energyRow.gooDeviationKwh < 0
          ? `opprinnelsesgarantier (GoO) ${formatSignedKwh(energyRow.gooDeviationKwh)}`
          : null,
      ].filter((text): text is string => text !== null);
      indicators.push({
        id: `energy-${contract.id}`,
        contractId: contract.id,
        category: "energy",
        kind: "active",
        priority: isBreach ? "high" : "medium",
        title: isBreach ? "Energiforpliktelse ikke oppfylt" : "Energiforpliktelse i fare",
        detail: `${isBreach ? "Levert for" : "Anslått for"} ${energyRow.year} sammenlignet med avtalen: ${shortfalls.join(", ")}.`,
        date: null,
        daysUntil: null,
      });
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
          title: `${label} utløpt`,
          detail: `Utløp ${formatCertificateDate(certificate.validUntil)} (for ${ago} ${ago === 1 ? "dag" : "dager"} siden).`,
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
          title: `${label}: dokumentasjon mangler`,
          detail: "Påkrevd i avtalen, men ingen sertifikatdokumentasjon er sendt inn",
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
          title: `${label} utløper`,
          detail: `Utløper ${formatCertificateDate(certificate.validUntil)} (${formatDaysUntil(info.daysRemaining)}).`,
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

    // Same model as the Suppliers page: the level comes from the total of the findings' points, not the single worst one.
    const score = indicators.reduce((sum, i) => sum + RISK_POINTS[i.priority], 0);
    return {
      contract,
      indicators,
      score,
      priority: score >= HIGH_RISK_SCORE ? "high" : score >= MEDIUM_RISK_SCORE ? "medium" : score >= 1 ? "low" : "none",
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