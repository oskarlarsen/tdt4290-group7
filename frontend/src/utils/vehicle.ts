import type { ApprovalStatus, CheckSummary, RegistryCode, VehicleCheck } from "../types/vehicle";

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  ACTIVE: "Approved", NOT_YET_ACTIVE: "Not yet active", EXPIRED: "Expired", REVOKED: "Revoked", NOT_APPROVED: "Not approved",
};
export const DECIMAL_FIELDS = [
  ["totalTripKm", "Total distance (km)"], ["co2GramsPerKm", "Supplier CO₂ (g/km)"],
  ["medianCo2", "Median CO₂ (reported value)"], ["averageConsumptionLitresPerKm", "Average consumption (L/km, not L/100 km)"],
  ["fuelConsumedLitres", "Total fuel consumed (L)"], ["totalKmNoxRegistered", "NOx-covered distance (km)"],
  ["totalNoxRegisteredGrams", "Total registered NOx (g)"], ["totalKmCo2Registered", "CO₂-covered distance (km)"],
  ["totalKmCo2NotRegistered", "Distance without registered CO₂ (km)"],
  ["totalKmFuelRegistered", "Fuel-covered distance (km)"], ["kmFuelNotRegistered", "Distance without registered fuel (km)"],
] as const;
const decimalKeys = new Set<string>([...DECIMAL_FIELDS.map(([key]) => key), "estimatedCo2Kg", "noxMgPerKm"]);

/** Tokenise strings as whole tokens so text containing number-like JSON is never rewritten. */
export function parseVehicleJson<T>(text: string): T {
  let previousString = "";
  let previousEnd = -1;
  const exact = text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token, offset: number) => {
    const isString = token.startsWith('"');
    const replace = !isString && decimalKeys.has(previousString) && /^\s*:\s*$/.test(text.slice(previousEnd, offset));
    previousString = isString ? JSON.parse(token) : "";
    previousEnd = offset + token.length;
    return replace ? JSON.stringify(token) : token;
  });
  return JSON.parse(exact) as T;
}

export function normalizePlate(value: string): string { return value.toUpperCase().replace(/[\s-]/g, ""); }
export function validPlate(value: string): string {
  const plate = normalizePlate(value);
  if (!/^[A-Z0-9]{2,7}$/.test(plate)) throw new Error("Enter a registration number with 2–7 letters or digits.");
  return plate;
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Keep exact decimal literals through input -> JSON -> BigDecimal. Do not use Number(). */
export function decimalLiteral(value: string, label: string): string {
  const input = value.trim();
  if (input.length > 80) throw new Error(`${label}: enter at most 80 characters.`);
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error(`${label}: enter a non-negative number using a decimal point (e.g. 12.34).`);
  const [whole, fraction = ""] = input.split(".");
  const significantFraction = fraction.replace(/0+$/, "");
  const coefficient = BigInt(whole + significantFraction);
  if (significantFraction.length > 18 || coefficient > 9223372036854775807n)
    throw new Error(`${label}: the number exceeds the supported precision or range.`);
  return whole.replace(/^0+(?=\d)/, "") + (significantFraction ? `.${significantFraction}` : "");
}

export function statisticsBody(values: Record<string, string>): string {
  const plate = validPlate(values.registrationNumber ?? "");
  if (!validDate(values.periodStart) || !validDate(values.periodEnd)) throw new Error("Both reporting dates must be valid dates (YYYY-MM-DD).");
  if (values.periodEnd < values.periodStart) throw new Error("Period end cannot be before period start.");
  const row: string[] = [
    `"registrationNumber":${JSON.stringify(plate)}`, `"periodStart":${JSON.stringify(values.periodStart)}`, `"periodEnd":${JSON.stringify(values.periodEnd)}`,
  ];
  for (const key of ["fuelTechnology", "make", "vehicleType", "model", "assignmentNumber", "comment"]) {
    if (values[key]?.trim()) row.push(`${JSON.stringify(key)}:${JSON.stringify(values[key].trim())}`);
  }
  for (const [key, label] of DECIMAL_FIELDS) if (values[key]?.trim()) row.push(`${JSON.stringify(key)}:${decimalLiteral(values[key], label)}`);
  if (values.tripCount?.trim()) {
    if (!/^\d+$/.test(values.tripCount.trim()) || BigInt(values.tripCount.trim()) > 2147483647n) throw new Error("Job/trip count must be a whole number between 0 and 2147483647.");
    row.push(`"tripCount":${Number(values.tripCount)}`);
  }
  if (values.co2Registered && values.co2Registered !== "unknown") row.push(`"co2Registered":${values.co2Registered === "true"}`);
  return `{"sourceName":${JSON.stringify(values.sourceName?.trim() || null)},"rows":[{${row.join(",")}}]}`;
}

export function checkLabel(check?: CheckSummary | null): string {
  if (!check) return "Not checked";
  if (check.deviations.length) return `${check.deviations.length} recorded deviation${check.deviations.length === 1 ? "" : "s"}`;
  if (check.dataSource === "UNAVAILABLE" || check.lookupOutcome !== "FOUND") return "Verification incomplete";
  if (check.dataSource === "STALE_CACHE") return "Stale verification";
  return "No recorded deviations";
}
export function summaryOf(check: VehicleCheck): CheckSummary {
  return { ...check.registry, id: check.id, checkedAt: check.checkedAt, approvalStatus: check.approvalStatus, deviations: check.deviations };
}
export function humanize(value: string): string { return value.toLowerCase().replace(/_/g, " "); }
export function timestamp(value?: string | null): string { return value ? new Date(value).toLocaleString() : "Not available"; }
export function codeLabel(value?: RegistryCode | null): string { return value ? `${value.name ?? value.code}${value.name ? ` (${value.code})` : ""}` : "Not provided"; }
