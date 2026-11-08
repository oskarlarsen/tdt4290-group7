import * as db from "../mocks/db";
import type { EnergyData } from "../types/energy";
import { getContracts } from "./contracts";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// The backend stores supplier energy reports per facility but has no per-contract renewable-share requirement
// or admin summary yet, so real mode shows no records. With VITE_USE_MOCKS=true, fictional consumption is
// attached to the real contracts so the page can be seen with data.
export async function getEnergyData(): Promise<EnergyData> {
  if (!USE_MOCKS) return { requirements: [], records: [] };
  const template = db.getEnergyData();
  const contracts = await getContracts();
  const withEnergy = contracts.filter((contract) => contract.status !== "Expired");
  return {
    requirements: withEnergy.map((contract, i) => ({ contractId: contract.id, minRenewableSharePercent: template.requirements[i % template.requirements.length].minRenewableSharePercent })),
    records: withEnergy.map((contract, i) => {
      const record = template.records[i % template.records.length];
      return { ...record, id: `energy-${contract.id}`, contractId: contract.id };
    }),
  };
}
