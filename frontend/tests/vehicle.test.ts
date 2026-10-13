import { describe, expect, it } from "vitest";
import { DECIMAL_FIELDS, checkLabel, decimalLiteral, parseVehicleJson, statisticsBody, validDate, validPlate } from "../src/utils/vehicle";
import type { CheckSummary } from "../src/types/vehicle";

const values: Record<string, string> = {
  registrationNumber: "ab-12345", periodStart: "2026-01-01", periodEnd: "2026-01-31",
  fuelTechnology: "2", vehicleCategory: "M1", bodyType: "AA", make: "Synthetic make", model: "Synthetic model",
  co2Registered: "false", tripCount: "0", ...Object.fromEntries(DECIMAL_FIELDS.map(([key]) => [key, "0"])),
};
describe("vehicle input and safe status presentation", () => {
  it("preserves exact numeric literals and omitted values when posting a single row", () => {
    const body = statisticsBody({ ...values, co2GramsPerKm: "123.456789012345678", totalTripKm: "000.00", co2Registered: "false", tripCount: "02", comment: 'text with \"co2GramsPerKm\":999' });
    expect(body).toContain('"co2GramsPerKm":123.456789012345678');
    const decoded = parseVehicleJson<{ rows: Record<string, unknown>[] }>(body).rows[0];
    expect(decoded.co2GramsPerKm).toBe("123.456789012345678");
    expect(decoded.totalTripKm).toBe("0");
    expect(decoded.tripCount).toBe(2);
    expect(decoded.co2Registered).toBe(false);
    expect(decoded.comment).toBe('text with "co2GramsPerKm":999');
    expect(decoded.medianCo2).toBe("0");
    expect(decoded.registrationNumber).toBe("AB12345");
  });
  it("preserves nested SVV decimals, exponent notation, nulls and ordinary JSON numbers", () => {
    expect(parseVehicleJson('{"total":25,"items":[{"noxMgPerKm":1.23456789012345678e-2,"estimatedCo2Kg":0,"medianCo2":null}]}'))
      .toEqual({ total: 25, items: [{ noxMgPerKm: "1.23456789012345678e-2", estimatedCo2Kg: "0", medianCo2: null }] });
  });
  it("rejects invalid or out-of-range numeric input instead of rounding/coercing", () => {
    for (const input of ["-1", "1,2", "1e3", "NaN", "true", "0.0000000000000000001", "9223372036854775808"]) {
      expect(() => decimalLiteral(input, "Distance")).toThrow();
    }
    expect(decimalLiteral("0.123456789012345678000", "Value")).toBe("0.123456789012345678");
    expect(() => statisticsBody({ ...values, tripCount: "1.2" })).toThrow();
    expect(() => statisticsBody({ ...values, tripCount: "2147483648" })).toThrow();
  });
  it("requires real dates, ordered periods and valid normalized plates", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2024-02-29")).toBe(true);
    expect(validPlate(" ab-12345 ")).toBe("AB12345");
    expect(validPlate("ab 1234")).toBe("AB1234");
    for (const plate of ["TEST01", "A12345", "ABC12345", "AB01234", "AB123", "AB123456", "AB1234O", "bad/plate", "ÆB12345"]) expect(() => validPlate(plate)).toThrow();
    expect(() => statisticsBody({ ...values, periodEnd: "2025-12-31" })).toThrow();
    expect(() => statisticsBody({ ...values, periodStart: "" })).toThrow();
    expect(() => statisticsBody({ ...values, co2Registered: "unknown" })).toThrow();
  });
  it("requires every applicable statistic and preserves explicit zero/false", () => {
    for (const key of Object.keys(values)) expect(() => statisticsBody({ ...values, [key]: "" }), key).toThrow();
    const row = JSON.parse(statisticsBody(values)).rows[0];
    expect(row.co2Registered).toBe(false); expect(row.totalNoxRegisteredGrams).toBe(0);
    expect(row).not.toHaveProperty("assignmentNumber"); expect(row).not.toHaveProperty("comment");
    for (const [key, value] of [["fuelTechnology", "Diesel"], ["fuelTechnology", "999"], ["vehicleCategory", "light"], ["bodyType", "Sedan"], ["make", "   "]])
      expect(() => statisticsBody({ ...values, [key]: value })).toThrow();
  });
  it("makes litres not applicable for electric/hydrogen vehicles and trailers, not hybrids", () => {
    for (const fuelTechnology of ["5", "6", "NOT_APPLICABLE"]) {
      const input = { ...values, fuelTechnology, vehicleCategory: fuelTechnology === "NOT_APPLICABLE" ? "O1" : "M1",
        averageConsumptionLitresPerKm: "", fuelConsumedLitres: "" };
      const row = JSON.parse(statisticsBody(input)).rows[0];
      expect(row.averageConsumptionLitresPerKm).toBeNull(); expect(row.fuelConsumedLitres).toBeNull();
      expect(() => statisticsBody({ ...input, fuelConsumedLitres: "0" })).toThrow();
    }
    for (const fuelTechnology of ["7", "8"]) {
      expect(JSON.parse(statisticsBody({ ...values, fuelTechnology })).rows[0].fuelConsumedLitres).toBe(0);
      expect(() => statisticsBody({ ...values, fuelTechnology, fuelConsumedLitres: "" })).toThrow();
    }
    expect(() => statisticsBody({ ...values, vehicleCategory: "O1" })).toThrow();
    expect(() => statisticsBody({ ...values, fuelTechnology: "NOT_APPLICABLE" })).toThrow();
  });
  it("never labels stale or unavailable verification as a clean result", () => {
    const base: CheckSummary = { id: "synthetic", checkedAt: "2026-01-01T00:00:00Z", approvalStatus: "ACTIVE", lookupOutcome: "FOUND", dataSource: "CACHE", deviations: [] };
    expect(checkLabel(null)).toBe("Not checked");
    expect(checkLabel({ ...base, dataSource: "UNAVAILABLE" })).toBe("Verification incomplete");
    expect(checkLabel({ ...base, dataSource: "STALE_CACHE" })).toBe("Stale verification");
    expect(checkLabel({ ...base, lookupOutcome: "NOT_FOUND" })).toBe("Verification incomplete");
    expect(checkLabel({ ...base, deviations: ["DEREGISTERED"] })).toBe("1 recorded deviation");
    expect(checkLabel(base)).toBe("No recorded deviations");
  });
});
