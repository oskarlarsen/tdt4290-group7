// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VEHICLE_CATEGORIES, vehicleWeightRange } from "../src/utils/vehicleCatalog";

const workspace = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("../src/hooks/useMySupplierOverview", () => ({
  useMySupplierOverview: () => ({ data: workspace.data, isLoading: false, isError: false, error: null }),
}));
import MyVehicles from "../src/pages/supplier/MyVehicles";

afterEach(cleanup);

describe("vehicleWeightRange", () => {
  it("gives a weight range for each weight class and none for cars or unknown categories", () => {
    expect(vehicleWeightRange("N2")).toBe("3 500 til 12 000 kg");
    expect(vehicleWeightRange("M3")).toBe("over 5 000 kg");
    expect(vehicleWeightRange("M1")).toBeNull();
    expect(vehicleWeightRange("ZZ")).toBeNull();
    expect(vehicleWeightRange(null)).toBeNull();
  });

  it("agrees with the weight written in each category's name", () => {
    // The ranges are written out once more as structured data, so check they cannot drift from the labels.
    for (const [code, label] of Object.entries(VEHICLE_CATEGORIES)) {
      const range = vehicleWeightRange(code);
      if (range === null) continue;
      const numbers = (text: string) => text.match(/\d{1,3}(?:,\d{3})*/g) ?? [];
      expect(numbers(range), code).toEqual(numbers(label));
    }
  });
});

describe("My Vehicles", () => {
  it("shows each vehicle's fuel and weight range, with a dash where they are unknown", () => {
    workspace.data = {
      agreements: [],
      vehicles: [
        { registrationNumber: "AB12345", agreementId: "a1", planned: false, listed: true, uploaded: true, fuelTechnology: "2", vehicleCategory: "N2" },
        { registrationNumber: "CD12346", agreementId: "a1", planned: false, listed: true, uploaded: true, fuelTechnology: null, vehicleCategory: null },
      ],
    };
    render(<MemoryRouter><MyVehicles /></MemoryRouter>);
    // Listed vehicles that were reported show in both the approved and the reported table.
    expect(screen.getAllByText("Diesel")).toHaveLength(2);
    expect(screen.getAllByText(/3.500 til 12.000 kg/)).toHaveLength(2);
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
});
