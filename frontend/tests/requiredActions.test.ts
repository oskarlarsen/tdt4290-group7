import { describe, expect, it } from "vitest";
import { buildRequiredActions } from "../src/utils/requiredActions";
import type { SupplierWorkspaceData } from "../src/hooks/useMySupplierOverview";

const agreement = { id: "a1", note: "", saksnr: "2026/1", startDate: "2026-01-01", endDate: "2027-12-31", allowedVehicles: 5, activeVehiclesCount: 0, active: true, requiresVehicles: true, requiresEnergy: true, requiresProducts: false };

function workspace(patch: Partial<SupplierWorkspaceData> = {}): SupplierWorkspaceData {
  return {
    overview: { supplierId: "s", supplierName: "S", orgNumber: "1", onboardingStatus: "DATA_DRAFT", agreements: [agreement], totalVehicles: 0, totalCertificates: 0, totalEnergyRecords: 0, totalProducts: 0 },
    agreements: [agreement], vehicles: [], energy: [], products: [], certificates: [],
    ...patch,
  } as SupplierWorkspaceData;
}

describe("buildRequiredActions", () => {
  const now = new Date("2026-11-12T12:00:00");

  it("asks for onboarding, vehicles and the quarter that just ended, most urgent first", () => {
    const actions = buildRequiredActions(workspace(), now);
    expect(actions.map((a) => a.id)).toEqual(["submit-onboarding", "vehicles-a1", "energy-a1-3"]);
    expect(actions.every((a) => a.priority === "high")).toBe(true);
  });

  it("is empty once everything is in", () => {
    const data = workspace({
      overview: { ...workspace().overview, onboardingStatus: "SUBMITTED" },
      vehicles: [{ agreementId: "a1", listed: true }] as never,
      energy: [{ agreementId: "a1", reportingYear: 2026, reportingQuarter: 3 }] as never,
    });
    expect(buildRequiredActions(data, now)).toEqual([]);
  });
});
