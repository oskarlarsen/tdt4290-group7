import { describe, expect, it } from "vitest";
import { buildReportRows, type ReportSources } from "../src/utils/reportBuilders";
import type { VehicleDetails } from "../src/types/vehicle";

const sources: ReportSources = {
  suppliers: [], contracts: [], vehicles: [], certificates: [],
  energy: { requirements: [], records: [] }, riskOutlook: [], alerts: [],
};
const vehicle: VehicleDetails = {
  vehicle: { registrationNumber: "AB12345", agreementId: "agreement", listed: true, planned: false,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  agreement: {
    supplier: { id: "supplier", name: "Test supplier", orgNumber: "123456789", active: true, updatedAt: "2026-01-01T00:00:00Z" },
    agreement: { id: "agreement", supplierId: "supplier", startDate: "2026-01-01", endDate: "2027-12-31",
      allowedVehicles: 2, note: "", active: true, updatedAt: "2026-01-01T00:00:00Z" },
  },
  tripRows: [], latestSnapshot: null,
  latestCheck: { id: "saved-check", checkedAt: "2026-10-27T00:00:00Z", dataSource: "CACHE", lookupOutcome: "FOUND", deviations: ["FUEL_MISMATCH"] },
};

describe("vehicle report after the agreement redesign", () => {
  it("uses the linked supplier and agreement dates while retaining saved check findings", () => {
    const rows = buildReportRows("vehicles", { ...sources, vehicles: [vehicle] });
    expect(rows).toEqual([{
      "Registration number": "AB12345", "Supplier ID": "supplier",
      "Agreement start": "2026-01-01", "Agreement end": "2027-12-31",
      "Latest check": "1 recorded deviation", "Recorded deviations": "FUEL_MISMATCH",
    }]);
  });

  it("does not invent an approval or a successful check when evidence is absent", () => {
    const [row] = buildReportRows("vehicles", { ...sources, vehicles: [{ ...vehicle, agreement: null, latestCheck: null }] });
    expect(row["Supplier ID"]).toBe("");
    expect(row["Agreement start"]).toBe("");
    expect(row["Latest check"]).toBe("Not checked");
    expect(row).not.toHaveProperty("Approval status");
    expect(row).not.toHaveProperty("Fuel technology on approval");
  });

  it("keeps an incomplete registry check distinguishable from a clean result", () => {
    const [row] = buildReportRows("vehicles", { ...sources, vehicles: [{ ...vehicle,
      latestCheck: { ...vehicle.latestCheck!, dataSource: "UNAVAILABLE", lookupOutcome: "NOT_CONFIGURED", deviations: [] },
    }] });
    expect(row["Latest check"]).toBe("Verification incomplete");
  });
});
