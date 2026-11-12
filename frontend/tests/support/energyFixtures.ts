import type { EnergyContract } from "../../src/types/energy";

export function energyContract(overrides: Partial<EnergyContract> = {}): EnergyContract {
  return {
    agreementId: "agr-1",
    supplierId: "sup-1",
    supplierName: "Midtnorsk Bygg AS",
    orgNumber: "912345674",
    saksnr: "2026/0103",
    year: 2026,
    commitment: { minSelfProducedKwh: 1000, minGooKwh: 500 },
    status: "COMPLIANT",
    reportedQuarters: [1, 2, 3, 4],
    selfProducedKwh: 1000,
    gooCoveredKwh: 500,
    consumedKwh: 4000,
    selfProducedDeviationKwh: 0,
    gooDeviationKwh: 0,
    projectedSelfProducedKwh: 1000,
    projectedGooKwh: 500,
    selfProducedSharePercent: 25,
    kwhPerSqm: 20,
    quarterTotals: [],
    facilities: [],
    evidence: [],
    ...overrides,
  };
}
