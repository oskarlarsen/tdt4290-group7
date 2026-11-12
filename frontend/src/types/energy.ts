import { formatNumber } from "../utils/formatNumber";

// Mirrors the backend's EnergyContractSummary. The server decides the status; the page only displays it.
export type EnergyStatus = "COMPLIANT" | "AT_RISK" | "NON_COMPLIANT" | "MISSING_DATA" | "NO_COMMITMENT";

export const ENERGY_STATUS_LABELS: Record<EnergyStatus, string> = {
  COMPLIANT: "Ingen avvik",
  AT_RISK: "Fare for avvik",
  NON_COMPLIANT: "Avvik",
  MISSING_DATA: "Mangler data",
  NO_COMMITMENT: "Ingen forpliktelse",
};

export const ENERGY_STATUS_TONES: Record<EnergyStatus, "red" | "orange" | "yellow" | "tertiary"> = {
  NON_COMPLIANT: "red",
  AT_RISK: "orange",
  MISSING_DATA: "yellow",
  NO_COMMITMENT: "yellow",
  COMPLIANT: "tertiary",
};

// Lower = more urgent. Used for sorting by status.
export const ENERGY_STATUS_RANK: Record<EnergyStatus, number> = {
  NON_COMPLIANT: 0,
  AT_RISK: 1,
  MISSING_DATA: 2,
  NO_COMMITMENT: 3,
  COMPLIANT: 4,
};

export type EnergyCommitment = { minSelfProducedKwh: number; minGooKwh: number };

export type EnergyQuarterTotal = { quarter: number; selfProducedKwh: number; gooCoveredKwh: number; consumedKwh: number };

export type EnergyFacilityQuarter = {
  locationCode: string;
  address: string;
  quarter: number;
  totalAreaSqm: number;
  consumedKwh: number;
  selfProducedKwh: number;
  gooCoveredKwh: number;
};

export type EnergyEvidence = {
  id: string;
  reportingYear: number;
  reportingQuarter: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

/** One contract's energy position for one year. */
export type EnergyContract = {
  agreementId: string;
  supplierId: string;
  supplierName: string;
  orgNumber: string;
  saksnr: string | null;
  year: number;
  commitment: EnergyCommitment | null;
  status: EnergyStatus;
  reportedQuarters: number[];
  selfProducedKwh: number;
  gooCoveredKwh: number;
  consumedKwh: number;
  /** Projected year-end minus committed; negative = below the commitment. Null without a commitment or data. */
  selfProducedDeviationKwh: number | null;
  gooDeviationKwh: number | null;
  projectedSelfProducedKwh: number | null;
  projectedGooKwh: number | null;
  selfProducedSharePercent: number | null;
  kwhPerSqm: number | null;
  quarterTotals: EnergyQuarterTotal[];
  facilities: EnergyFacilityQuarter[];
  evidence: EnergyEvidence[];
};

export type EnergyData = EnergyContract[];

export type EnergyTotals = {
  contractCount: number;
  withCommitmentCount: number;
  selfProducedKwh: number;
  committedSelfProducedKwh: number;
  gooCoveredKwh: number;
  committedGooKwh: number;
  nonCompliantCount: number;
  atRiskCount: number;
  reportedCount: number;
};

// Delivered and committed kWh are summed only over contracts that have both a commitment and data,
// so a contract with no commitment can't inflate or deflate the percentage.
export function summarizeEnergy(contracts: readonly EnergyContract[]): EnergyTotals {
  const assessed = contracts.filter((c) => c.commitment !== null && c.reportedQuarters.length > 0);
  return {
    contractCount: contracts.length,
    withCommitmentCount: assessed.length,
    selfProducedKwh: assessed.reduce((sum, c) => sum + c.selfProducedKwh, 0),
    committedSelfProducedKwh: assessed.reduce((sum, c) => sum + (c.commitment?.minSelfProducedKwh ?? 0), 0),
    gooCoveredKwh: assessed.reduce((sum, c) => sum + c.gooCoveredKwh, 0),
    committedGooKwh: assessed.reduce((sum, c) => sum + (c.commitment?.minGooKwh ?? 0), 0),
    nonCompliantCount: contracts.filter((c) => c.status === "NON_COMPLIANT").length,
    atRiskCount: contracts.filter((c) => c.status === "AT_RISK").length,
    reportedCount: contracts.filter((c) => c.reportedQuarters.length > 0).length,
  };
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatKwh(kwh: number): string {
  // Real values, never rounded to whole kWh or MWh (the customer asked for exactly what was reported).
  return `${formatNumber(kwh)} kWh`;
}

/** Signed, for deviations: "+1 200 kWh" or "−12 400 kWh". */
export function formatSignedKwh(kwh: number): string {
  return `${kwh > 0 ? "+" : kwh < 0 ? "−" : ""}${formatNumber(Math.abs(kwh))} kWh`;
}

/** Same upper bound as the backend: 10 TWh a year. Anything above is a typo, not a contract. */
export const MAX_ENERGY_COMMITMENT_KWH = 10_000_000_000;

/** A year is closed once Q4 is reported or the year has passed; until then the deviation is a projection. */
export function isEnergyYearClosed(row: Pick<EnergyContract, "year" | "reportedQuarters">, now: Date = new Date()): boolean {
  return row.reportedQuarters.includes(4) || row.year < now.getFullYear();
}

export function currentReportingYear(now: Date = new Date()): number {
  return now.getFullYear();
}
