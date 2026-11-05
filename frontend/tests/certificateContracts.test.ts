import { describe, expect, it } from "vitest";
import { getActiveCertificateContracts } from "../src/utils/certificateContracts";
import type { FleetOverview } from "../src/types/vehicle";

describe("getActiveCertificateContracts", () => {
  it("joins certificates to real active agreements and suppliers only", () => {
    const fleet: FleetOverview = {
      suppliers: [
        { id: "supplier-1", name: "Active AS", orgNumber: "123456789", active: true, updatedAt: null },
        { id: "supplier-2", name: "Removed AS", orgNumber: "987654321", active: false, updatedAt: null },
      ],
      agreements: [
        { id: "agreement-1", supplierId: "supplier-1", startDate: "2026-01-01", endDate: "2027-01-01", allowedVehicles: 2, note: "Transport", updatedAt: "now", active: true, requiresVehicles: true, requiresEnergy: false, requiresProducts: false },
        { id: "agreement-2", supplierId: "supplier-2", startDate: "2026-01-01", endDate: "2027-01-01", allowedVehicles: 2, note: "Removed supplier", updatedAt: "now", active: true, requiresVehicles: true, requiresEnergy: false, requiresProducts: false },
        { id: "agreement-3", supplierId: "supplier-1", startDate: "2026-01-01", endDate: "2027-01-01", allowedVehicles: 2, note: "Inactive", updatedAt: "now", active: false, requiresVehicles: true, requiresEnergy: false, requiresProducts: false },
      ],
      vehicles: [],
      changes: [],
    };

    expect(getActiveCertificateContracts(fleet)).toEqual([
      {
        id: "agreement-1",
        contractName: "Transport",
        supplierId: "supplier-1",
        supplierName: "Active AS",
        supplierOrgId: "123456789",
        startDate: "2026-01-01",
        endDate: "2027-01-01",
      },
    ]);
  });
});
