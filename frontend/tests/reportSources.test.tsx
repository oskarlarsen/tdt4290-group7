// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as api from "../src/api/vehicles";
import { useReportSources } from "../src/hooks/useReportSources";
import { VEHICLE_REPORT_LIMIT } from "../src/types/report";
import type { FleetOverview, Vehicle, VehicleDetails } from "../src/types/vehicle";

vi.hoisted(() => { vi.stubEnv("VITE_USE_MOCKS", "false"); });
vi.mock("../src/hooks/useDashboardSummary", () => ({ useDashboardSummary: () => ({ data: { topRiskSuppliers: [] } }) }));
vi.mock("../src/hooks/useContracts", () => ({ useContracts: () => ({ data: [] }) }));
vi.mock("../src/hooks/useCertificates", () => ({ useCertificates: () => ({ data: [] }) }));
vi.mock("../src/hooks/useEnergy", () => ({ useEnergy: () => ({ data: { requirements: [], records: [] } }) }));
vi.mock("../src/hooks/useAlerts", () => ({ useAlerts: () => ({ data: [] }) }));
vi.mock("../src/hooks/useRiskOutlook", () => ({ useRiskOutlook: () => ({ rows: [], isLoading: false, isError: false }) }));

const registered: Vehicle = { registrationNumber: "AB12345", agreementId: "agreement", listed: true, planned: false,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const fleet = (vehicles: Vehicle[]): FleetOverview => ({ suppliers: [], agreements: [], vehicles, changes: [] });
const details = (registrationNumber: string): VehicleDetails => ({ vehicle: { ...registered, registrationNumber },
  agreement: null, tripRows: [], latestSnapshot: null, latestCheck: null });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(useReportSources, { wrapper });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllEnvs());

describe("vehicle report sources after merging the fleet API", () => {
  it("requests only listed real vehicles and preserves the existing report limit", async () => {
    const real = Array.from({ length: VEHICLE_REPORT_LIMIT + 2 }, (_, index) => ({ ...registered, registrationNumber: `AB${12345 + index}` }));
    vi.spyOn(api, "getFleet").mockResolvedValue(fleet([
      { ...registered, registrationNumber: "PLAN12345", planned: true },
      { ...registered, registrationNumber: "CD12345", listed: false }, ...real,
    ]));
    const getVehicle = vi.spyOn(api, "getVehicle").mockImplementation(async (plate) => details(plate));
    const runCheck = vi.spyOn(api, "runCheck");
    const { result } = mount();
    await waitFor(() => expect(result.current.sources?.vehicles).toHaveLength(VEHICLE_REPORT_LIMIT));
    expect(getVehicle.mock.calls.map(([plate]) => plate)).toEqual(real.slice(0, VEHICLE_REPORT_LIMIT).map((vehicle) => vehicle.registrationNumber));
    expect(runCheck).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
  });

  it("treats an empty fleet as an empty report", async () => {
    vi.spyOn(api, "getFleet").mockResolvedValue(fleet([]));
    const getVehicle = vi.spyOn(api, "getVehicle");
    const { result } = mount();
    await waitFor(() => expect(result.current.sources?.vehicles).toEqual([]));
    expect(result.current.isLoading).toBe(false);
    expect(getVehicle).not.toHaveBeenCalled();
  });

  it("reports detail failures instead of exporting incomplete vehicle rows", async () => {
    vi.spyOn(api, "getFleet").mockResolvedValue(fleet([registered]));
    const getVehicle = vi.spyOn(api, "getVehicle").mockRejectedValue(new Error("Unavailable"));
    const { result } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.sources).toBeUndefined();
    expect(getVehicle).toHaveBeenCalledTimes(1);
  });
});
