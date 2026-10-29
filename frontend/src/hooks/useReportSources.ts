import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getVehicle } from "../api/vehicles";
import { useAlerts } from "./useAlerts";
import { useCertificates } from "./useCertificates";
import { useContracts } from "./useContracts";
import { useDashboardSummary } from "./useDashboardSummary";
import { useEnergy } from "./useEnergy";
import { useRiskOutlook } from "./useRiskOutlook";
import { useFleet } from "./useVehicles";
import { VEHICLE_REPORT_LIMIT } from "../types/report";
import type { ReportSources } from "../utils/reportBuilders";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// Composes the existing queries (React Query dedupes them), so the Reports page can never
// disagree with the pages it summarizes.
// TODO(backend): a real reporting service would replace this client-side composition.
export function useReportSources() {
  const dashboard = useDashboardSummary();
  const contracts = useContracts();
  // Preserve the PR's mock-mode behavior and report limit, using the current fleet API.
  const fleet = useFleet(!USE_MOCKS);
  const vehicles = useQueries({
    queries: (USE_MOCKS ? [] : fleet.data?.vehicles ?? [])
      .filter((vehicle) => vehicle.listed && !vehicle.planned)
      .slice(0, VEHICLE_REPORT_LIMIT)
      .map((vehicle) => ({
        queryKey: ["vehicles", "detail", vehicle.registrationNumber],
        queryFn: () => getVehicle(vehicle.registrationNumber),
        retry: false,
      })),
  });
  const certificates = useCertificates();
  const energy = useEnergy();
  const alerts = useAlerts();
  const riskOutlook = useRiskOutlook();

  const sources = useMemo<ReportSources | undefined>(() => {
    const vehicleItems = USE_MOCKS ? [] : fleet.data && vehicles.every((vehicle) => vehicle.data)
      ? vehicles.map((vehicle) => vehicle.data!) : undefined;
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
    fleet.data,
    vehicles,
    certificates.data,
    energy.data,
    alerts.data,
    riskOutlook.rows,
  ]);

  const queries = [dashboard, contracts, certificates, energy, alerts, ...(!USE_MOCKS ? [fleet, ...vehicles] : [])];
  return {
    sources,
    isLoading:
      queries.some((q) => q.isLoading) || riskOutlook.isLoading,
    isError:
      queries.some((q) => q.isError) || riskOutlook.isError,
  };
}
