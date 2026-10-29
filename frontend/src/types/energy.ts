import { formatNumber } from "../utils/formatNumber";

export type EnergyCarrier = "electric" | "biogas" | "fossil";

export const ENERGY_CARRIER_LABELS: Record<EnergyCarrier, string> = {
  electric: "Electric",
  biogas: "Biogas",
  fossil: "Fossil",
};

// Every carrier is expressed in kWh (fuel volumes as energy equivalent).
// One record per contract = its latest reporting period. History is not modeled.
export type EnergyRecord = {
  id: string;
  contractId: string;
  period: string; // e.g. "Q3 2026"
  consumptionKwh: Record<EnergyCarrier, number>;
};

// The contract's requirement. "Renewable" = electric + biogas.
// The maximum fossil share is the complement (100 - minimum).
export type EnergyRequirement = {
  contractId: string;
  minRenewableSharePercent: number;
};

export type EnergyData = {
  requirements: EnergyRequirement[];
  records: EnergyRecord[];
};

export type EnergyComplianceStatus = "compliant" | "minor-deviation" | "breach";
export type EnergyTone = "red" | "yellow" | "tertiary";

// PROVISIONAL: the customer defines no energy deviation bands. A shortfall up to
// this many percentage points is a "minor deviation"; anything larger is a breach.
export const ENERGY_THRESHOLDS = { minorDeviationPoints: 5 } as const;

export type EnergyAnalysis = {
  totalKwh: number;
  shares: Record<EnergyCarrier, number>; // percent of total, 0-100
  renewableSharePercent: number;
  minRenewableSharePercent: number;
  maxFossilSharePercent: number;
  shortfallPoints: number; // > 0 means below the contract minimum
  fossilExcessKwh: number; // fossil energy above the allowed amount, whole kWh, >= 0
  status: EnergyComplianceStatus;
  tone: EnergyTone;
  label: string;
  rank: number; // lower = more urgent
};

const EPSILON = 1e-9;

export function getTotalKwh(consumption: Record<EnergyCarrier, number>): number {
  return consumption.electric + consumption.biogas + consumption.fossil;
}

// Derived, never stored, so it can't drift from the consumption behind it.
export function analyzeEnergy(record: EnergyRecord, requirement: EnergyRequirement): EnergyAnalysis {
  const { electric, biogas, fossil } = record.consumptionKwh;
  const totalKwh = getTotalKwh(record.consumptionKwh);
  const toPercent = (kwh: number) => (totalKwh > 0 ? (kwh / totalKwh) * 100 : 0);

  const shares: Record<EnergyCarrier, number> = {
    electric: toPercent(electric),
    biogas: toPercent(biogas),
    fossil: toPercent(fossil),
  };
  const renewableSharePercent = shares.electric + shares.biogas;
  const minRenewableSharePercent = requirement.minRenewableSharePercent;
  const maxFossilSharePercent = 100 - minRenewableSharePercent;
  const shortfallPoints = minRenewableSharePercent - renewableSharePercent;
  const fossilExcessKwh = Math.max(
    0,
    Math.round(fossil - (maxFossilSharePercent / 100) * totalKwh)
  );

  const base = {
    totalKwh,
    shares,
    renewableSharePercent,
    minRenewableSharePercent,
    maxFossilSharePercent,
    shortfallPoints,
    fossilExcessKwh,
  };

  if (shortfallPoints <= EPSILON) {
    return { ...base, status: "compliant", tone: "tertiary", label: "Compliant", rank: 2 };
  }
  if (shortfallPoints <= ENERGY_THRESHOLDS.minorDeviationPoints) {
    return { ...base, status: "minor-deviation", tone: "yellow", label: "Minor deviation", rank: 1 };
  }
  return { ...base, status: "breach", tone: "red", label: "Breach", rank: 0 };
}

export type EnergySummary = {
  totalKwh: number;
  renewableKwh: number;
  renewableSharePercent: number | null;
  weightedMinimumPercent: number | null;
  fossilExcessKwh: number;
};

export function summarizeEnergyRows(
  rows: readonly {
    record: EnergyRecord;
    requirement: EnergyRequirement;
    analysis: EnergyAnalysis;
  }[]
): EnergySummary {
  const totalKwh = rows.reduce((sum, row) => sum + row.analysis.totalKwh, 0);
  const renewableKwh = rows.reduce(
    (sum, row) => sum + row.record.consumptionKwh.electric + row.record.consumptionKwh.biogas,
    0
  );

  return {
    totalKwh,
    renewableKwh,
    renewableSharePercent: totalKwh > 0 ? (renewableKwh / totalKwh) * 100 : null,
    weightedMinimumPercent:
      totalKwh > 0
        ? rows.reduce(
            (sum, row) =>
              sum + row.requirement.minRenewableSharePercent * row.analysis.totalKwh,
            0
          ) / totalKwh
        : null,
    fossilExcessKwh: rows.reduce((sum, row) => sum + row.analysis.fossilExcessKwh, 0),
  };
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatKwh(kwh: number): string {
  return `${formatNumber(Math.round(kwh))} kWh`;
}

export function formatEnergy(kwh: number): string {
  if (kwh >= 1_000_000) return `${(kwh / 1_000_000).toFixed(2)} GWh`;
  if (kwh >= 1_000) return `${formatNumber(Math.round(kwh / 1_000))} MWh`;
  return `${formatNumber(Math.round(kwh))} kWh`;
}