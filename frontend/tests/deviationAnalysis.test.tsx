import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeDeviation, exactRatio } from "../src/utils/deviationAnalysis";
import { DeviationFacts } from "../src/components/vehicles/DeviationFacts";
import { DeviationList } from "../src/components/vehicles/VehicleCheckResult";
import type { DeviationFinding, TripRow, VehicleCheck } from "../src/types/vehicle";

const row: TripRow = { id: "synthetic-row", registrationNumber: "AB12345", createdAt: "2026-01-01T00:00:00Z", estimatedCo2Kg: "72",
  data: { registrationNumber: "AB12345", periodStart: "2026-01-01", periodEnd: "2026-01-31", fuelTechnology: "2", vehicleCategory: "M1", bodyType: "AA", make: "Synthetic", model: "Synthetic",
    co2Registered: true, co2GramsPerKm: "120", totalTripKm: "600", totalKmCo2Registered: "600", totalKmCo2NotRegistered: "0", kmFuelNotRegistered: "0", totalKmFuelRegistered: "600", totalKmNoxRegistered: "600", totalNoxRegisteredGrams: "18", averageFuelConsumptionLitresPer100Km: "8", fuelConsumedLitres: "48" } };
const check: VehicleCheck = { id: "synthetic-check", checkedAt: "2026-02-01T00:00:00Z", vehicle: { registrationNumber: "AB12345", createdAt: "synthetic", updatedAt: "synthetic", agreementId: null, listed: false, planned: false }, agreement: null, tripRows: [row], deviations: [], findings: [],
  registry: { dataSource: "LIVE", lookupOutcome: "FOUND", fetchedAt: "2026-02-01T00:00:00Z", deviations: [], usageProhibitionState: "UNKNOWN", data: { registrationNumber: "AB12345", bodyType: { code: "AB", name: "ignored untranslated label" }, fuels: [{ fuelTechnology: { code: "2" }, measurements: [{ measurementMethod: { code: "WLTP" }, co2GramsPerKm: "140", noxMgPerKm: "40" }] }] } } };
const finding = (code: string): DeviationFinding => ({ code, priority: "MODERATE", origin: "REGISTRY", description: "Synthetic saved reason", tripRowId: row.id, fuelIndex: 0, measurementIndex: 0 });

describe("saved deviation fact comparisons", () => {
  it("explains NOx in comparable units with the actual calculation inputs", () => {
    const analysis = analyzeDeviation(finding("NOX_MISMATCH"), check);
    expect(analysis.comparison.rows[0]).toEqual({ label: "NOx rate", left: "30 mg/km", right: "40 mg/km" });
    expect(analysis.inputs).toEqual([["Supplier total NOx", "18 g"], ["NOx-registered distance", "600 km"]]);
    expect(analysis.comparison.rightLabel).toContain("WLTP");
    expect(analysis.note).toContain("grams × 1000 ÷");
  });
  it("shows body styles as labels and codes rather than unexplained mismatch names", () => {
    const analysis = analyzeDeviation(finding("BODY_TYPE_MISMATCH"), check);
    expect(analysis.comparison.rows[0]).toEqual({ label: "Body style", left: "AA - Sedan", right: "AB - Hatchback" });
    expect(analysis.explanation).toContain("separate from the technical vehicle category");
  });
  it("shows original CO2 precision separately from comparison rounding", () => {
    const changed = { ...check, tripRows: [{ ...row, data: { ...row.data, co2GramsPerKm: "120.49" } }] };
    const analysis = analyzeDeviation(finding("CO2_MISMATCH"), changed);
    expect(analysis.comparison.rows[0].left).toBe("120.49 g/km");
    expect(analysis.comparison.rows[1].left).toBe("120 g/km");
    expect(changed.tripRows[0].data.co2GramsPerKm).toBe("120.49");
  });
  it("calculates consumption from saved liters and total distance", () => {
    const analysis = analyzeDeviation(finding("CONSUMPTION_MISMATCH"), check);
    expect(analysis.comparison.rows[0]).toEqual({ label: "Average fuel consumption", left: "8 L/100km", right: "8 L/100km" });
    expect(analysis.inputs).toEqual([["Total fuel consumed", "48 L"], ["Total distance", "600 km"]]);
  });
  it("does not substitute zero or another method for missing references", () => {
    const absent = { ...finding("NOX_MISMATCH"), measurementIndex: 100 };
    expect(analyzeDeviation(absent, check).comparison.rows[0].right).toContain("Not available");
    expect(exactRatio("18", "0", 1000n)).toBeNull();
  });
  it("explains a zero NOx denominator with the conflicting calculation facts", () => {
    const zeroDistance = { ...check, tripRows: [{ ...row, data: { ...row.data, totalKmNoxRegistered: "0" } }] };
    const analysis = analyzeDeviation(finding("UNABLE_TO_VERIFY"), zeroDistance);
    expect(analysis.comparison.rightLabel).toBe("Calculation requirement");
    expect(analysis.comparison.rows[0]).toEqual({ label: "NOx-registered distance", left: "0 km", right: "Greater than 0 km to calculate mg/km" });
    expect(analysis.note).toContain("not be substituted with zero");
  });
  it("keeps inapplicable supplier CO2 distinct from missing registry data", () => {
    const electric = { ...check, tripRows: [{ ...row, data: { ...row.data, fuelTechnology: "5" as const, co2Registered: false, co2GramsPerKm: null } }] };
    const analysis = analyzeDeviation(finding("CO2_CLASSIFICATION_MISMATCH"), electric);
    expect(analysis.comparison.rows.find(r => r.label.startsWith("CO₂"))?.left).toBe("Not applicable");
  });
  it("uses exact integer arithmetic and avoids double rounding", () => {
    expect(exactRatio("9007199254740993", "1", 1n, 0)).toBe("9007199254740993");
    expect(exactRatio("1.8e1", "6e2", 1000n)).toBe("30");
    expect(exactRatio("8.5", "1", 1n, 0)).toBe("9");
    expect(exactRatio("0.4999999", "1", 1n, 0)).toBe("0");
    expect(exactRatio("2", "3")).toBe("0.666667");
    expect(exactRatio("1", "1", 1n, -1)).toBeNull();
    expect(exactRatio("1e1000000", "1")).toBeNull();
  });
  it("compares reporting periods with the saved agreement evidence", () => {
    const analysis = analyzeDeviation(finding("AGREEMENT_PERIOD_NOT_COVERED"), check);
    expect(analysis.comparison.rows[0]).toEqual({ label: "Period", left: "01.01.2026 to 31.01.2026", right: "No agreement linked" });
  });
  it("renders a keyboard-operable fact expander with source labels and readable units", () => {
    const html = renderToStaticMarkup(<DeviationFacts finding={finding("NOX_MISMATCH")} check={check} />);
    expect(html).toContain("<details"); expect(html).toContain("See compared values");
    expect(html).toContain("Supplier statistics (calculated)"); expect(html).toContain("Statens vegvesen (WLTP)");
    expect(html).toContain("30 mg/km"); expect(html).toContain("40 mg/km");
    expect(html).toContain("18 g"); expect(html).toContain("600 km");
  });
  it("identifies the comparison source without exposing priority controls by default", () => {
    const populated = { ...check, findings: [finding("NOX_MISMATCH")] };
    const html = renderToStaticMarkup(<DeviationList check={populated} />);
    expect(html).toContain("Compared with Statens vegvesen");
    expect(html).toContain("NOx rates do not match"); expect(html).toContain("See compared values");
    expect(html).not.toContain("Deviation priority");
  });
});
