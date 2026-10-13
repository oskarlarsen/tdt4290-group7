import { describe, expect, it } from "vitest";
import { checkLabel, decimalLiteral, parseVehicleJson, statisticsBody, validDate, validPlate } from "../src/utils/vehicle";
import type { CheckSummary } from "../src/types/vehicle";

const values = { registrationNumber: "test-01", periodStart: "2026-01-01", periodEnd: "2026-01-31" };
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
    expect(decoded).not.toHaveProperty("medianCo2");
    expect(decoded.registrationNumber).toBe("TEST01");
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
    expect(validPlate(" test-01 ")).toBe("TEST01");
    expect(() => validPlate("bad/plate")).toThrow();
    expect(() => statisticsBody({ ...values, periodEnd: "2025-12-31" })).toThrow();
    expect(() => statisticsBody({ ...values, periodStart: "" })).toThrow();
    expect(JSON.parse(statisticsBody({ ...values, co2Registered: "unknown" })).rows[0]).not.toHaveProperty("co2Registered");
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
