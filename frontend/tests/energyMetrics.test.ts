import { describe, expect, it } from "vitest";
import { analyzeEnergy, summarizeEnergyRows } from "../src/types/energy";
import { getDerivedContracts, getEnergyData } from "../src/mocks/db";
import {
  ENERGY_STATUS_FILTERS,
  filterEnergyRows,
  getEnergyAttentionRows,
  getEnergyNoticeReason,
  getEnergyStatusLabel,
  getEnergySuggestedNoticeMessage,
} from "../src/components/energy/energyFilters";
import type { EnergyRow, MissingEnergyRow } from "../src/components/energy/EnergyTable";

const energyData = getEnergyData();
const contracts = getDerivedContracts();
const rows: EnergyRow[] = energyData.records.flatMap((record) => {
  const requirement = energyData.requirements.find((item) => item.contractId === record.contractId);
  const contract = contracts.find((item) => item.id === record.contractId);
  return requirement && contract
    ? [{ record, requirement, contract, analysis: analyzeEnergy(record, requirement) }]
    : [];
});
const missingRows: MissingEnergyRow[] = [
  {
    kind: "missing",
    id: "missing-sup-b",
    contract: contracts.find((item) => item.id === "sup-b")!,
    requirement: energyData.requirements[0],
  },
];

describe("summarizeEnergyRows", () => {
  it("calculates aggregate KPIs and per-contract compliance from the reported records", () => {
    const summary = summarizeEnergyRows(rows);

    expect(summary.totalKwh).toBe(1_800_000);
    expect(summary.renewableKwh).toBe(1_108_000);
    expect(summary.renewableSharePercent).toBeCloseTo(61.5556, 3);
    expect(summary.weightedMinimumPercent).toBeCloseTo(71.6667, 3);
    expect(summary.fossilExcessKwh).toBe(222_000);
    expect(rows.map((row) => row.analysis.status)).toEqual(["compliant", "breach", "breach"]);
  });

  it("returns unavailable percentages for an empty dataset", () => {
    expect(summarizeEnergyRows([])).toEqual({
      totalKwh: 0,
      renewableKwh: 0,
      renewableSharePercent: null,
      weightedMinimumPercent: null,
      fossilExcessKwh: 0,
    });
  });

  describe("Energy status filter", () => {
    it("provides the four requested labels without counts", () => {
      expect(ENERGY_STATUS_FILTERS.map(({ label }) => label)).toEqual([
        "All",
        "Compliant",
        "Non-compliant",
        "Missing data",
      ]);
    });

    it("uses the original labels for compliant and deviation statuses", () => {
      expect(getEnergyStatusLabel("compliant")).toBe("Compliant");
      expect(getEnergyStatusLabel("minor-deviation")).toBe("Non-compliant");
      expect(getEnergyStatusLabel("breach")).toBe("Non-compliant");
    });

    it("filters compliant, non-compliant, and missing records using their derived status", () => {
      expect(filterEnergyRows(rows, missingRows, "compliant", "")).toHaveLength(1);
      expect(filterEnergyRows(rows, missingRows, "non-compliant", "")).toHaveLength(2);
      expect(filterEnergyRows(rows, missingRows, "missing-data", "")).toEqual(missingRows);
    });

    it("resets status with All and combines search with the selected status", () => {
      expect(filterEnergyRows(rows, missingRows, "all", "")).toHaveLength(4);
      expect(filterEnergyRows(rows, missingRows, "all", "supplier b")).toEqual(missingRows);
      expect(filterEnergyRows(rows, missingRows, "non-compliant", "supplier c")).toHaveLength(1);
      expect(filterEnergyRows(rows, missingRows, "compliant", "supplier c")).toHaveLength(0);
    });

    it("marks only records below their own contract minimum as requiring attention", () => {
      const attentionRows = getEnergyAttentionRows(rows);

      expect(attentionRows).toHaveLength(2);
      expect(attentionRows.every((row) => row.analysis.status !== "compliant")).toBe(true);
      expect(getEnergyNoticeReason(attentionRows[0])).toContain("below the contract minimum of 80.0%");
      expect(getEnergyNoticeReason(attentionRows[0])).toContain("Reported fossil energy exceeds its contract limit");
      expect(getEnergyNoticeReason(attentionRows[1])).toContain("below the contract minimum of 80.0%");
      expect(getEnergyNoticeReason(rows[0])).toBeNull();
      expect(getEnergySuggestedNoticeMessage(rows[0])).toBeNull();
    });

    it("generates editable-message defaults using each row's period and contract-specific values", () => {
      const attentionRows = getEnergyAttentionRows(rows);
      const firstNotice = getEnergySuggestedNoticeMessage(attentionRows[0]);
      const secondNotice = getEnergySuggestedNoticeMessage(attentionRows[1]);

      expect(firstNotice).toContain("minimum of 80.0%");
      expect(firstNotice).toContain(attentionRows[0].record.period);
      expect(firstNotice).toContain(attentionRows[0].contract?.contractName);
      expect(firstNotice).toContain("fossil-energy limit");
      expect(secondNotice).toContain("minimum of 80.0%");
      expect(secondNotice).toContain(attentionRows[1].record.period);
      expect(secondNotice).toContain(attentionRows[1].contract?.contractName);
    });
  });
});
