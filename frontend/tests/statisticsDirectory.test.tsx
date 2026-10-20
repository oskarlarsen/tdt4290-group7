import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { StatisticsTable, StatisticsRowDetails } from "../src/components/vehicles/StatisticsDirectory";
import Vehicles from "../src/pages/admin/Vehicles";
import type { TripRow } from "../src/types/vehicle";

const row: TripRow = {
  id: "synthetic-row", registrationNumber: "AB12345", createdAt: "2026-01-01T00:00:00Z", estimatedCo2Kg: "123.456789012345678",
  data: { registrationNumber: "AB12345", periodStart: "2026-01-01", periodEnd: "2026-01-31", fuelTechnology: "2", vehicleCategory: "M1", bodyType: "AA", make: "Synthetic", model: "Synthetic",
    co2Registered: false, co2GramsPerKm: "0", totalTripKm: "1000", totalKmCo2Registered: "1000", totalKmCo2NotRegistered: "0", kmFuelNotRegistered: "0", totalKmFuelRegistered: "0", totalKmNoxRegistered: "1000", totalNoxRegisteredGrams: "0", tripCount: 2, averageFuelConsumptionLitresPer100Km: null, fuelConsumedLitres: null },
};

describe("statistics directory", () => {
  it("displays each appended row separately with exact values and reporting periods", () => {
    const html = renderToStaticMarkup(<StatisticsTable rows={[row, { ...row, id: "second-row" }]} onSelect={() => {}} />);
    expect(html).toContain("Estimated CO₂");
    expect(html.match(/123\.456789012345678/g)).toHaveLength(2);
    expect(html.match(/View details for AB12345/g)).toHaveLength(2);
    expect(html).toContain("2026-01-01"); expect(html).toContain("2026-01-31");
  });
  it("shows zero separately from not-applicable litres in read-only row details", () => {
    const electric = { ...row, estimatedCo2Kg: null, data: { ...row.data, fuelTechnology: "5", co2GramsPerKm: null, totalNoxRegisteredGrams: null, totalKmCo2Registered: null, totalKmNoxRegistered: null } };
    const html = renderToStaticMarkup(<StatisticsRowDetails row={electric} onClose={() => {}} onOpenVehicle={() => {}} />);
    expect(html).toContain("Not applicable"); expect(html).toContain("Estimated CO₂");
    expect(html).toContain("5 - Electric"); expect(html).toContain("Open vehicle");
    expect(html).not.toContain("<input"); expect(html).toContain("Vehicle and NOx details");
  });
  it("keeps the overview focused on suppliers with statistics and history collapsed", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Vehicles /></MemoryRouter></QueryClientProvider>);
    expect(html).toContain("Find supplier, organization number or vehicle");
    expect(html).toContain("Reporting statistics"); expect(html).toContain("Change history");
    expect(html).toContain("Add supplier"); expect(html).not.toContain("coming soon");
    expect(html).not.toContain("Add approval period");
  });
});
