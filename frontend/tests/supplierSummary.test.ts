import { describe, expect, it } from "vitest";
import { buildSupplierPortfolioSummary } from "../src/mocks/supplierSummary";
import type { TopRiskSupplier, UnmodeledSupplierAggregate } from "../src/types/dashboard";

const aggregate: UnmodeledSupplierAggregate = {
  totalSuppliers: 146,
  highRiskSuppliers: 4,
  mediumRiskSuppliers: 25,
};

function supplier(id: string, risk: TopRiskSupplier["risk"]): TopRiskSupplier {
  return {
    id,
    displayName: id,
    orgId: id,
    primaryContract: "Contract",
    risk,
    mainIssue: "",
  };
}

describe("buildSupplierPortfolioSummary", () => {
  it("combines modeled records with only the unmodeled aggregate", () => {
    const result = buildSupplierPortfolioSummary(
      [
        supplier("high-a", "high"),
        supplier("high-b", "high"),
        supplier("high-c", "high"),
        supplier("medium-a", "medium"),
        supplier("compliant-a", "compliant"),
      ],
      aggregate,
      4
    );

    expect(result.monitoredSuppliers).toBe(151);
    expect(result.riskClassification.high.count).toBe(7);
    expect(result.riskClassification.medium.count).toBe(26);
    expect(result.riskClassification.compliant.count).toBe(118);
    expect(
      result.riskClassification.high.count +
        result.riskClassification.medium.count +
        result.riskClassification.compliant.count
    ).toBe(result.monitoredSuppliers);
    expect(result.riskClassification.compliant.percent).toBe(78);
  });

  it("updates totals and risk classifications when modeled supplier records change", () => {
    const result = buildSupplierPortfolioSummary(
      [supplier("reclassified", "medium"), supplier("new-compliant", "compliant")],
      aggregate,
      4
    );

    expect(result.monitoredSuppliers).toBe(148);
    expect(result.riskClassification.high.count).toBe(4);
    expect(result.riskClassification.medium.count).toBe(26);
    expect(result.riskClassification.compliant.count).toBe(118);
  });

  it("updates totals and risk classifications when unmodeled aggregate data changes", () => {
    const result = buildSupplierPortfolioSummary(
      [supplier("modeled-high", "high")],
      { totalSuppliers: 2, highRiskSuppliers: 1, mediumRiskSuppliers: 1 },
      0
    );

    expect(result.monitoredSuppliers).toBe(3);
    expect(result.riskClassification.high.count).toBe(2);
    expect(result.riskClassification.medium.count).toBe(1);
    expect(result.riskClassification.compliant.count).toBe(0);
  });

  it("returns zero percentages for an empty supplier population", () => {
    const result = buildSupplierPortfolioSummary(
      [],
      { totalSuppliers: 0, highRiskSuppliers: 0, mediumRiskSuppliers: 0 },
      0
    );

    expect(result.monitoredSuppliers).toBe(0);
    expect(result.riskClassification).toEqual({
      compliant: { count: 0, percent: 0 },
      medium: { count: 0, percent: 0 },
      low: { count: 0, percent: 0 },
      high: { count: 0, percent: 0 },
      unassessed: { count: 0, percent: 0 },
    });
  });
});
