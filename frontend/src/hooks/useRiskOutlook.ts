import { useMemo } from "react";
import { useCertificates } from "./useCertificates";
import { useContracts } from "./useContracts";
import { useEnergy } from "./useEnergy";
import { buildRiskOutlook } from "../types/riskOutlook";

// Reuses existing queries to keep risk data consistent across pages.
// TODO: Replace with GET /admin/risk-outlook when the backend is ready.
export function useRiskOutlook() {
  const contracts = useContracts();
  const certificates = useCertificates();
  const energy = useEnergy();

  const rows = useMemo(
    () =>
      contracts.data && certificates.data && energy.data
        ? buildRiskOutlook({
            contracts: contracts.data,
            certificates: certificates.data,
            energy: energy.data,
          })
        : undefined,
    [contracts.data, certificates.data, energy.data]
  );

  return {
    rows,
    isLoading: contracts.isLoading || certificates.isLoading || energy.isLoading,
    isError: contracts.isError || certificates.isError || energy.isError,
  };
}