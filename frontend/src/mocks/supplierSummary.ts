import type {
  RiskClassification,
  SupplierPortfolioSummary,
  TopRiskSupplier,
  UnmodeledSupplierAggregate,
} from "../types/dashboard";

export function buildSupplierPortfolioSummary(
  modeledSuppliers: readonly TopRiskSupplier[],
  unmodeledSuppliers: UnmodeledSupplierAggregate,
  renewedThisMonthCount: number
): SupplierPortfolioSummary {
  const modeledRiskCounts = modeledSuppliers.reduce(
    (counts, supplier) => {
      counts[supplier.risk] += 1;
      return counts;
    },
    { high: 0, medium: 0, compliant: 0 }
  );

  const monitoredSuppliers = modeledSuppliers.length + unmodeledSuppliers.totalSuppliers;
  const highCount = modeledRiskCounts.high + unmodeledSuppliers.highRiskSuppliers;
  const mediumCount = modeledRiskCounts.medium + unmodeledSuppliers.mediumRiskSuppliers;
  const compliantCount = monitoredSuppliers - highCount - mediumCount;
  const percent = (count: number) =>
    monitoredSuppliers === 0 ? 0 : Math.round((count / monitoredSuppliers) * 100);

  const riskClassification: RiskClassification = {
    compliant: { count: compliantCount, percent: percent(compliantCount) },
    medium: { count: mediumCount, percent: percent(mediumCount) },
    high: { count: highCount, percent: percent(highCount) },
  };

  return {
    monitoredSuppliers,
    renewedThisMonthCount,
    riskClassification,
  };
}
