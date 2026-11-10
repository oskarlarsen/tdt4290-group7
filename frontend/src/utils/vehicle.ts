import type { CheckSummary, RegistryCode, VehicleCheck, StatisticsSave } from "../types/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, isTrailer, selectedCode, statisticNotApplicable, emissionsNotApplicable, INAPPLICABLE_EMISSION_FIELDS } from "./vehicleCatalog";

export const DECIMAL_FIELDS = [
  ["totalTripKm", "Total distance (km)"], ["co2GramsPerKm", "Supplier CO₂ (g/km)"],
  ["averageFuelConsumptionLitresPer100Km", "Average fuel consumption (L/100km)"],
  ["fuelConsumedLitres", "Total fuel consumed (L)"], ["totalKmNoxRegistered", "NOx-registered distance (km)"],
  ["totalNoxRegisteredGrams", "Total registered NOx (g)"], ["totalKmCo2Registered", "CO₂-registered distance (km)"],
  ["totalKmCo2NotRegistered", "Distance without registered CO₂ (km)"],
  ["totalKmFuelRegistered", "Fuel-registered distance (km)"], ["kmFuelNotRegistered", "Distance without registered fuel (km)"],
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
  if (!/^[A-Z]{2}[1-9][0-9]{3,4}$/.test(plate)) throw new Error("Enter two letters followed by four or five digits, without a leading zero.");
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

/** Exact preview of the backend calculation; never sent as an editable request field. */
export function estimatedCo2Preview(distance: string, rate: string): string {
  try {
    const [kmWhole, kmFraction = ""] = decimalLiteral(distance, "Distance").split(".");
    const [rateWhole, rateFraction = ""] = decimalLiteral(rate, "CO₂ rate").split(".");
    const coefficient = BigInt(kmWhole + kmFraction) * BigInt(rateWhole + rateFraction);
    const scale = kmFraction.length + rateFraction.length + 3;
    const digits = coefficient.toString().padStart(scale + 1, "0");
    const fraction = digits.slice(-scale).replace(/0+$/, "");
    return digits.slice(0, -scale) + (fraction ? `.${fraction}` : "");
  } catch { return ""; }
}

export function statisticsBody(values: Record<string, string>): string {
  const plate = validPlate(values.registrationNumber ?? "");
  if (!validDate(values.periodStart) || !validDate(values.periodEnd)) throw new Error("Both reporting dates must be valid dates (YYYY-MM-DD).");
  if (values.periodEnd < values.periodStart) throw new Error("Period end cannot be before period start.");
  const fuel = selectedCode(FUEL_TECHNOLOGIES, values.fuelTechnology ?? "", "fuel technology");
  const category = selectedCode(VEHICLE_CATEGORIES, values.vehicleCategory ?? "", "vehicle category");
  selectedCode(BODY_TYPES, values.bodyType ?? "", "body type");
  if (emissionsNotApplicable(fuel) && (values.co2Registered !== "false" || INAPPLICABLE_EMISSION_FIELDS.some(key => values[key]?.trim())))
    throw new Error("Electric/hydrogen statistics require no CO₂-emitting flag and not-applicable CO₂/NOx values and registered distances.");
  if (isTrailer(category) !== (fuel === "NOT_APPLICABLE")) throw new Error("Use Not applicable fuel exactly for trailer categories O1–O4.");
  const row: string[] = [
    `"registrationNumber":${JSON.stringify(plate)}`, `"periodStart":${JSON.stringify(values.periodStart)}`, `"periodEnd":${JSON.stringify(values.periodEnd)}`,
  ];
  for (const key of ["fuelTechnology", "make", "vehicleCategory", "bodyType", "model"]) {
    if (!values[key]?.trim()) throw new Error(`${key} is required.`);
    row.push(`${JSON.stringify(key)}:${JSON.stringify(values[key].trim())}`);
  }
  for (const key of ["comment"]) {
    if (values[key]?.trim()) row.push(`${JSON.stringify(key)}:${JSON.stringify(values[key].trim())}`);
  }
  for (const [key, label] of DECIMAL_FIELDS) {
    if (statisticNotApplicable(key, fuel)) {
      if (values[key]?.trim()) throw new Error(`${label} is not applicable for this fuel technology.`);
      row.push(`${JSON.stringify(key)}:null`);
    } else {
      if (!values[key]?.trim()) throw new Error(`${label} is required.`);
      row.push(`${JSON.stringify(key)}:${decimalLiteral(values[key], label)}`);
    }
  }
  if (!["true", "false"].includes(values.co2Registered)) throw new Error("Select whether the vehicle is registered as CO₂-emitting.");
  row.push(`"co2Registered":${values.co2Registered === "true"}`);
  return `{"sourceName":${JSON.stringify(values.sourceName?.trim() || null)},"rows":[{${row.join(",")}}]}`;
}

export function checkLabel(check?: CheckSummary | null): string {
  if (!check) return "Not checked";
  const total = (check.highPriorityCount ?? 0) + (check.moderatePriorityCount ?? 0);
  if (total) return `${total} deviation${total === 1 ? "" : "s"} (${check.highPriorityCount ?? 0} high, ${check.moderatePriorityCount ?? 0} moderate)`;
  if (check.deviations.length) return `${check.deviations.length} recorded deviation${check.deviations.length === 1 ? "" : "s"}`;
  if (check.dataSource === "UNAVAILABLE" || check.lookupOutcome !== "FOUND") return "Verification incomplete";
  if (check.dataSource === "STALE_CACHE") return "Stale verification";
  return "No recorded deviations";
}
export function summaryOf(check: VehicleCheck): CheckSummary {
  return { ...check.registry, id: check.id, checkedAt: check.checkedAt, deviations: check.deviations,
    highPriorityCount: (check.findings ?? []).filter(f => f.priority === "HIGH").length,
    moderatePriorityCount: (check.findings ?? []).filter(f => f.priority === "MODERATE").length };
}
export function statisticsSaveMessage(result: StatisticsSave, plate: string): string {
  const outcome = result.checks.find(item => item.registrationNumber === plate);
  if (outcome?.error) return outcome.error;
  if (!outcome?.check) return "Statistics saved, but verification was not returned. Run a check from vehicle details; do not resubmit statistics.";
  const checked = outcome.check;
  const registry = checked.dataSource === "UNAVAILABLE" || checked.lookupOutcome !== "FOUND"
    ? `Statens vegvesen verification incomplete (${humanize(checked.lookupOutcome)}).`
    : checked.dataSource === "STALE_CACHE" ? "Statens vegvesen verification uses stale data; refresh failed." : `Statens vegvesen data: ${humanize(checked.dataSource)}.`;
  return `Statistics saved and automatic check recorded: ${checkLabel(checked)}. ${registry}`;
}
export function humanize(value: string): string { return value.toLowerCase().replace(/_/g, " "); }
export function timestamp(value?: string | null): string { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Oslo" }).format(new Date(value)) : "Not available"; }
export function codeLabel(value?: RegistryCode | null): string { return value ? `${value.name ?? value.code}${value.name ? ` (${value.code})` : ""}` : "Not provided"; }

export function vehicleDate(value: string): string { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join(".") : value; }
export function agreementDuration(start: string, end: string): string {
  if (!validDate(start) || !validDate(end) || end < start) return "";
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return `${days} day${days === 1 ? "" : "s"}`;
}
