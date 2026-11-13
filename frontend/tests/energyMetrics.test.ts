import { describe, expect, it } from "vitest";
import { formatKwh, formatSignedKwh, isEnergyYearClosed, summarizeEnergy } from "../src/types/energy";
import {
  ENERGY_STATUS_FILTERS,
  filterEnergy,
  getEnergyAttentionRows,
  getEnergyNoticeReason,
  getEnergySuggestedNoticeMessage,
  sortEnergy,
} from "../src/components/energy/energyFilters";
import { energyContract } from "./support/energyFixtures";

const compliant = energyContract({ agreementId: "a", supplierName: "Nordic Transport AS", orgNumber: "912345671", saksnr: "2026/0100" });
const nonCompliant = energyContract({
  agreementId: "b",
  supplierName: "Bymiljø Drift AS",
  orgNumber: "912345676",
  saksnr: "2026/0105",
  status: "NON_COMPLIANT",
  selfProducedKwh: 400,
  gooCoveredKwh: 300,
  selfProducedDeviationKwh: -600,
  gooDeviationKwh: -200,
});
const atRisk = energyContract({
  agreementId: "c",
  supplierName: "Fjord Buss og Taxi AS",
  orgNumber: "912345673",
  saksnr: "2026/0102",
  status: "AT_RISK",
  reportedQuarters: [1, 2],
  selfProducedKwh: 400,
  selfProducedDeviationKwh: -200,
  gooDeviationKwh: 100,
});
const missing = energyContract({
  agreementId: "d",
  supplierName: "Trondheim Renovasjon AS",
  orgNumber: "912345672",
  saksnr: "2026/0101",
  status: "MISSING_DATA",
  reportedQuarters: [],
  selfProducedKwh: 0,
  gooCoveredKwh: 0,
  selfProducedDeviationKwh: null,
  gooDeviationKwh: null,
});
const noCommitment = energyContract({ agreementId: "e", supplierName: "Sør-Trøndelag Maskin AS", status: "NO_COMMITMENT", commitment: null, selfProducedDeviationKwh: null, gooDeviationKwh: null });
const rows = [compliant, nonCompliant, atRisk, missing, noCommitment];

describe("summarizeEnergy", () => {
  it("sums delivered and committed kWh only over contracts that have both a commitment and a report", () => {
    const totals = summarizeEnergy(rows);
    // compliant + nonCompliant + atRisk are assessed. missing has no report, noCommitment has no commitment.
    expect(totals.withCommitmentCount).toBe(3);
    expect(totals.selfProducedKwh).toBe(1000 + 400 + 400);
    expect(totals.committedSelfProducedKwh).toBe(3000);
    expect(totals.gooCoveredKwh).toBe(500 + 300 + 500);
    expect(totals.committedGooKwh).toBe(1500);
    expect(totals.nonCompliantCount).toBe(1);
    expect(totals.atRiskCount).toBe(1);
    expect(totals.contractCount).toBe(5);
    expect(totals.reportedCount).toBe(4);
  });

  it("returns zeros for no contracts", () => {
    expect(summarizeEnergy([])).toMatchObject({ contractCount: 0, selfProducedKwh: 0, committedSelfProducedKwh: 0, nonCompliantCount: 0 });
  });
});

describe("formatSignedKwh", () => {
  it("shows the sign so a shortfall is not mistaken for a surplus", () => {
    expect(formatSignedKwh(1200)).toMatch(/^\+1.200 kWh$/u);
    expect(formatSignedKwh(-12400)).toMatch(/^−12.400 kWh$/u);
    expect(formatSignedKwh(0)).toBe("0 kWh");
  });
});

describe("energy filters and sorting", () => {
  it("offers a filter for every status the server can return", () => {
    expect(ENERGY_STATUS_FILTERS.map(({ value }) => value)).toEqual([
      "all", "NON_COMPLIANT", "AT_RISK", "COMPLIANT", "MISSING_DATA", "NO_COMMITMENT",
    ]);
  });

  it("filters by status and combines it with search over supplier, org number and contract", () => {
    expect(filterEnergy(rows, "all", "")).toHaveLength(5);
    expect(filterEnergy(rows, "NON_COMPLIANT", "")).toEqual([nonCompliant]);
    expect(filterEnergy(rows, "all", "912345673")).toEqual([atRisk]);
    expect(filterEnergy(rows, "all", "2026/0100")).toEqual([compliant]);
    expect(filterEnergy(rows, "all", "  FJORD ")).toEqual([atRisk]);
    expect(filterEnergy(rows, "COMPLIANT", "fjord")).toEqual([]);
  });

  it("sorts by supplier name in both directions", () => {
    expect(sortEnergy(rows, "supplier", "asc").map((r) => r.agreementId)).toEqual(["b", "c", "a", "e", "d"]);
    expect(sortEnergy(rows, "supplier", "desc").map((r) => r.agreementId)).toEqual(["d", "e", "a", "c", "b"]);
  });

  it("sorts by status with the most urgent first, breaking ties by supplier", () => {
    expect(sortEnergy(rows, "status", "asc").map((r) => r.status)).toEqual([
      "NON_COMPLIANT", "AT_RISK", "MISSING_DATA", "NO_COMMITMENT", "COMPLIANT",
    ]);
    expect(sortEnergy(rows, "status", "desc").map((r) => r.status)).toEqual([
      "COMPLIANT", "NO_COMMITMENT", "MISSING_DATA", "AT_RISK", "NON_COMPLIANT",
    ]);
    const sameStatus = [energyContract({ agreementId: "z", supplierName: "Zeta AS" }), energyContract({ agreementId: "y", supplierName: "Alfa AS" })];
    expect(sortEnergy(sameStatus, "status", "asc").map((r) => r.supplierName)).toEqual(["Alfa AS", "Zeta AS"]);
  });

  it("does not mutate the rows it sorts", () => {
    const copy = [...rows];
    sortEnergy(rows, "supplier", "desc");
    expect(rows).toEqual(copy);
  });

  it("flags only non-compliant and at-risk contracts, most urgent first", () => {
    expect(getEnergyAttentionRows(rows).map((r) => r.agreementId)).toEqual(["b", "c"]);
  });
});

describe("energy notices", () => {
  it("explains a closed-year shortfall on both commitments", () => {
    const reason = getEnergyNoticeReason(nonCompliant)!;
    expect(reason).toContain("For 2026");
    expect(reason).toContain("600 kWh under forpliktelsen");
    expect(reason).toContain("200 kWh under minimumet");
  });

  it("describes an at-risk contract as a projection and mentions only the commitment that is short", () => {
    const reason = getEnergyNoticeReason(atRisk)!;
    expect(reason).toContain("Med nåværende tempo");
    expect(reason).toContain("egenprodusert");
    expect(reason).not.toContain("opprinnelsesgarantier");
  });

  it("has no notice for contracts that do not need one", () => {
    for (const row of [compliant, missing, noCommitment]) {
      expect(getEnergyNoticeReason(row)).toBeNull();
      expect(getEnergySuggestedNoticeMessage(row)).toBeNull();
    }
  });

  it("builds an editable message that names the contract and year", () => {
    const message = getEnergySuggestedNoticeMessage(nonCompliant)!;
    expect(message).toContain("2026/0105");
    expect(message).toContain("2026");
    expect(message).toContain("hvilke tiltak du planlegger");
  });
});

describe("kWh formatting and year state", () => {
  it("shows real kWh values instead of rounding to MWh", () => {
    expect(formatKwh(3500)).toMatch(/^3.500 kWh$/u);
    expect(formatKwh(1750)).toMatch(/^1.750 kWh$/u);
    expect(formatKwh(1_234_567)).toMatch(/^1.234.567 kWh$/u);
  });

  it("treats a year as closed once Q4 is reported or the year has passed", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    expect(isEnergyYearClosed({ year: 2026, reportedQuarters: [1, 2] }, now)).toBe(false);
    expect(isEnergyYearClosed({ year: 2026, reportedQuarters: [1, 4] }, now)).toBe(true);
    expect(isEnergyYearClosed({ year: 2025, reportedQuarters: [1] }, now)).toBe(true);
    expect(isEnergyYearClosed({ year: 2026, reportedQuarters: [] }, now)).toBe(false);
  });
});
