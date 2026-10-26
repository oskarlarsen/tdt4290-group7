import { useMemo } from "react";
import { useAlerts } from "./useAlerts";
import { useCertificates } from "./useCertificates";
import { useContracts } from "./useContracts";
import { useDashboardSummary } from "./useDashboardSummary";
import { useEnergy } from "./useEnergy";
import { useRiskOutlook } from "./useRiskOutlook";
import { useVehicles } from "./useVehicles";
import type { ReportSources } from "../utils/reportBuilders";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// Composes the existing queries (React Query dedupes them), so the Reports page can never
// disagree with the pages it summarizes.
// TODO(backend): a real reporting service would replace this client-side composition.
export function useReportSources() {
  const dashboard = useDashboardSummary();
  const contracts = useContracts();
  // The legacy vehicle fixture doesn't match VehicleOverview, so don't request or coerce it in mock mode.
  const vehicles = useVehicles("", "", 1, !USE_MOCKS);
  const certificates = useCertificates();
  const energy = useEnergy();
  const alerts = useAlerts();
  const riskOutlook = useRiskOutlook();

  const sources = useMemo<ReportSources | undefined>(() => {
    const vehicleItems = USE_MOCKS ? [] : vehicles.data?.items;
    if (
      !dashboard.data ||
      !contracts.data ||
      !vehicleItems ||
      !certificates.data ||
      !energy.data ||
      !alerts.data ||
      !riskOutlook.rows
    ) {
      return undefined;
    }
    return {
      suppliers: dashboard.data.topRiskSuppliers,
      contracts: contracts.data,
      vehicles: vehicleItems,
      certificates: certificates.data,
      energy: energy.data,
      riskOutlook: riskOutlook.rows,
      alerts: alerts.data,
    };
  }, [
    dashboard.data,
    contracts.data,
    vehicles.data,
    certificates.data,
    energy.data,
    alerts.data,
    riskOutlook.rows,
  ]);

  const queries = [dashboard, contracts, certificates, energy, alerts];
  return {
    sources,
    isLoading:
      queries.some((q) => q.isLoading) || (!USE_MOCKS && vehicles.isLoading) || riskOutlook.isLoading,
    isError:
      queries.some((q) => q.isError) || (!USE_MOCKS && vehicles.isError) || riskOutlook.isError,
  };
}