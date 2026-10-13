import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { StatisticsTable, StatisticsRowDetails } from "../src/components/vehicles/StatisticsDirectory";
import Vehicles from "../src/pages/admin/Vehicles";
import type { TripRow } from "../src/types/vehicle";

const row: TripRow = {
  id: "synthetic-row", registrationNumber: "AB12345", createdAt: "2026-01-01T00:00:00Z", estimatedCo2Kg: "123.456789012345678",
  data: { registrationNumber: "AB12345", periodStart: "2026-01-01", periodEnd: "2026-01-31", fuelTechnology: "5", vehicleCategory: "M1", bodyType: "AA", make: "Synthetic", model: "Synthetic",
    co2Registered: false, co2GramsPerKm: "0", medianCo2: "0", totalTripKm: "1000", totalKmCo2Registered: "1000", totalKmCo2NotRegistered: "0", kmFuelNotRegistered: "0", totalKmFuelRegistered: "0", totalKmNoxRegistered: "1000", totalNoxRegisteredGrams: "0", tripCount: 2, averageConsumptionLitresPerKm: null, fuelConsumedLitres: null },
};

describe("statistics directory", () => {
  it("displays each appended row separately with exact values and reporting periods", () => {
    const html = renderToStaticMarkup(<StatisticsTable rows={[row, { ...row, id: "second-row" }]} onSelect={() => {}} />);
    expect(html).toContain("Calculated CO₂ (kg)");
    expect(html.match(/123\.456789012345678/g)).toHaveLength(2);
    expect(html.match(/View statistics for AB12345/g)).toHaveLength(2);
    expect(html).toContain("2026-01-01"); expect(html).toContain("2026-01-31");
  });
  it("shows zero separately from not-applicable litres in read-only row details", () => {
    const html = renderToStaticMarkup(<StatisticsRowDetails row={row} onClose={() => {}} onOpenVehicle={() => {}} />);
    expect(html).toContain("Not applicable"); expect(html).toContain("Total CO₂ (kg, calculated)");
    expect(html).toContain("5 - Electric"); expect(html).toContain("Open vehicle");
    expect(html).not.toContain("<input"); expect(html).toContain("not measured emissions");
  });
  it("places the statistics directory after vehicles and removes the standalone check action", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Vehicles /></MemoryRouter></QueryClientProvider>);
    expect(html.indexOf("Statistics directory")).toBeGreaterThan(html.indexOf("Vehicle directory"));
    expect(html).not.toContain("Check a plate"); expect(html).toContain("Add statistics");
  });
});
