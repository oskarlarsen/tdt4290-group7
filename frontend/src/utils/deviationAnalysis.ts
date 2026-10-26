import { vehicleDate } from "./vehicle";
import type { DeviationFinding, RegistryCode, VehicleCheck } from "../types/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel, categoryGroup, fuelGroups, statisticNotApplicable } from "./vehicleCatalog";

const missing = "Not available in this saved check";
export type Comparison = { leftLabel: string; rightLabel: string; rows: { label: string; left: string; right: string }[] };
export type DeviationAnalysis = { title: string; explanation: string; comparison: Comparison; inputs?: [string, string][]; note?: string };

/** Display calculations from saved decimals, never Number()/floating-point arithmetic. */
function decimalParts(value: string) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match || value.length > 100) return null;
  const exponent = Number(match[4] ?? "0");
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null;
  let coefficient = BigInt(match[2] + (match[3] ?? ""));
  let scale = (match[3]?.length ?? 0) - exponent;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  return { coefficient: match[1] === "-" ? -coefficient : coefficient, scale };
}

export function exactRatio(numerator: string | null | undefined, denominator: string | null | undefined, multiplier = 1n, places = 6): string | null {
  if (numerator == null || denominator == null || !Number.isInteger(places) || places < 0 || places > 18) return null;
  const n = decimalParts(numerator), d = decimalParts(denominator);
  if (!n || !d || d.coefficient === 0n) return null;
  const raw = n.coefficient * multiplier * 10n ** BigInt(d.scale + places);
  const divisor = d.coefficient * 10n ** BigInt(n.scale);
  const negative = (raw < 0n) !== (divisor < 0n);
  const a = raw < 0n ? -raw : raw, b = divisor < 0n ? -divisor : divisor;
  const rounded = a / b + ((a % b) * 2n >= b ? 1n : 0n);
  const digits = rounded.toString().padStart(places + 1, "0");
  const fraction = places ? digits.slice(-places).replace(/0+$/, "") : "";
  return `${negative && rounded !== 0n ? "-" : ""}${places ? digits.slice(0, -places) : digits}${fraction ? `.${fraction}` : ""}`;
}
const number = (value: string | null | undefined, unit: string) => value == null ? missing : `${value} ${unit}`;
const whole = (value: string | null | undefined, unit: string) => number(exactRatio(value, "1", 1n, 0), unit);
const fuelLabel = (value?: RegistryCode | null) => value ? FUEL_TECHNOLOGIES[value.code as keyof typeof FUEL_TECHNOLOGIES]
  ? catalogLabel(FUEL_TECHNOLOGIES, value.code) : `${value.code} — ${value.name ?? "Unrecognized fuel technology"}` : missing;

const titles: Record<string, string> = {
  NOT_ON_AGREEMENT_LIST: "Vehicle is not in the agreement's vehicle list", AGREEMENT_NOT_STARTED: "Supplier agreement has not started",
  AGREEMENT_EXPIRED: "Supplier agreement has ended", AGREEMENT_PERIOD_NOT_COVERED: "Reporting period extends outside the agreement",
  FUEL_MISMATCH: "Fuel technologies do not match", CATEGORY_MISMATCH: "Vehicle categories do not match",
  BODY_TYPE_MISMATCH: "Reported body type differs from Statens vegvesen", BRAND_MISMATCH: "Vehicle brands do not match", MODEL_MISMATCH: "Vehicle models do not match",
  CO2_CLASSIFICATION_MISMATCH: "CO₂-emitting classification does not match", CO2_MISMATCH: "Reported CO₂ rate does not match",
  REGISTRY_CO2_DISAGREEMENT: "Registry CO₂ measurements differ", NOX_MISMATCH: "NOx rates do not match",
  CONSUMPTION_MISMATCH: "Fuel consumption figures do not agree", OVERLAPPING_STATISTICS: "Reporting periods overlap",
  UNABLE_TO_VERIFY: "Some information could not be verified", DEREGISTERED: "Vehicle is deregistered", EXPORTED: "Vehicle is exported",
  SCRAPPED: "Vehicle is scrapped", UNREGISTERED: "Vehicle is unregistered", UNKNOWN_REGISTRATION_STATUS: "Registration status is unknown",
};

/** Project existing saved evidence only. No API calls, description parsing or new compliance decisions. */
export function analyzeDeviation(finding: DeviationFinding, check: VehicleCheck): DeviationAnalysis {
  const row = check.tripRows.find(r => r.id === finding.tripRowId);
  const otherRow = check.tripRows.find(r => r.id === finding.relatedTripRowId);
  const data = check.registry.data;
  const fuel = finding.fuelIndex == null ? undefined : data?.fuels[finding.fuelIndex];
  const measurement = finding.measurementIndex == null ? undefined : fuel?.measurements[finding.measurementIndex];
  const method = measurement?.measurementMethod?.code ?? "method not recorded";
  const result: DeviationAnalysis = { title: titles[finding.code] ?? finding.code.toLowerCase().replace(/_/g, " "),
    explanation: finding.description, comparison: { leftLabel: "Reported / expected", rightLabel: "Saved reference", rows: [] } };
  const compare = (label: string, left: string | null | undefined, right: string | null | undefined) => result.comparison.rows.push({ label, left: left ?? missing, right: right ?? missing });
  const period = (start?: string | null, end?: string | null) => start ? `${vehicleDate(start)} to ${end ? vehicleDate(end) : "indefinite"}` : missing;
  switch (finding.code) {
    case "NOX_MISMATCH": {
      result.explanation = "The supplier's total NOx is converted from grams into milligrams per kilometer, then compared with the registry rate.";
      result.comparison.leftLabel = "Supplier statistics (calculated)"; result.comparison.rightLabel = `Statens vegvesen (${method})`;
      const calculated = exactRatio(row?.data.totalNoxRegisteredGrams, row?.data.totalKmNoxRegistered, 1000n);
      compare("NOx rate", number(calculated, "mg/km"), number(measurement?.noxMgPerKm, "mg/km"));
      compare("Values used for comparison (rounded)", number(exactRatio(row?.data.totalNoxRegisteredGrams, row?.data.totalKmNoxRegistered, 1000n, 0), "mg/km"), whole(measurement?.noxMgPerKm, "mg/km"));
      result.inputs = [["Supplier total NOx", number(row?.data.totalNoxRegisteredGrams, "g")], ["NOx-registered distance", number(row?.data.totalKmNoxRegistered, "km")]];
      result.note = "Calculation: total NOx grams × 1000 ÷ NOx-registered distance. Registry test figures and period figures are not equivalent measurements; this discrepancy needs review. Calculated display values use up to six decimals; comparisons use exact integer rounding.";
      break;
    }
    case "CO2_MISMATCH":
      result.explanation = "The supplier's CO₂ rate and this registry measurement round to different whole numbers.";
      result.comparison.leftLabel = "Supplier statistics"; result.comparison.rightLabel = `Statens vegvesen (${method})`;
      compare("CO₂ rate", number(row?.data.co2GramsPerKm, "g/km"), number(measurement?.co2GramsPerKm, "g/km"));
      compare("Values used for comparison (rounded)", whole(row?.data.co2GramsPerKm, "g/km"), whole(measurement?.co2GramsPerKm, "g/km"));
      result.note = "Every relevant registry measurement is checked, even if another one matches. Different measurement methods may explain a discrepancy.";
      break;
    case "CONSUMPTION_MISMATCH":
      result.explanation = "The reported average does not agree with an average calculated from this row's liters and distance.";
      result.comparison.leftLabel = "Supplier's reported average"; result.comparison.rightLabel = "Calculated from supplier totals";
      compare("Average fuel consumption", number(row?.data.averageFuelConsumptionLitresPer100Km, "L/100km"), number(exactRatio(row?.data.fuelConsumedLitres, row?.data.totalTripKm, 100n), "L/100km"));
      compare("Values used for comparison (rounded)", whole(row?.data.averageFuelConsumptionLitresPer100Km, "L/100km"), number(exactRatio(row?.data.fuelConsumedLitres, row?.data.totalTripKm, 100n, 0), "L/100km"));
      result.inputs = [["Total fuel consumed", number(row?.data.fuelConsumedLitres, "L")], ["Total distance", number(row?.data.totalTripKm, "km")]];
      result.note = "Calculation: liters × 100 ÷ total distance. This assumes both totals describe the same reporting scope. The calculated display uses up to six decimals; integer comparisons are calculated directly from the totals.";
      break;
    case "BODY_TYPE_MISMATCH":
      result.explanation = "The reported body style differs from the registered body style. Body style is separate from the technical vehicle category.";
      result.comparison.leftLabel = "Supplier statistics"; result.comparison.rightLabel = "Statens vegvesen";
      compare("Body style", row ? catalogLabel(BODY_TYPES, row.data.bodyType) : null, data?.bodyType ? catalogLabel(BODY_TYPES, data.bodyType.code) : null);
      break;
    case "FUEL_MISMATCH":
      result.comparison.leftLabel = "Supplier statistics"; result.comparison.rightLabel = "Statens vegvesen";
      compare("Fuel technology", row ? catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology) : null, data?.fuels.map(f => fuelLabel(f.fuelTechnology)).join("\n") || null);
      result.note = "The agreed gas variants are grouped, but CNG and LNG stay separate. The registry's original codes are retained.";
      break;
    case "CATEGORY_MISMATCH":
      result.comparison.leftLabel = "Supplier statistics"; result.comparison.rightLabel = "Statens vegvesen";
      compare("Vehicle category", row ? catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory) : null, data?.vehicleCategory ? catalogLabel(VEHICLE_CATEGORIES, categoryGroup(data.vehicleCategory.code)) : null);
      if (data?.vehicleCategory) compare("Original registry code", "Compared using its normalized category", data.vehicleCategory.code);
      break;
    case "BRAND_MISMATCH": case "MODEL_MISMATCH":
      result.comparison.leftLabel = "Supplier statistics"; result.comparison.rightLabel = "Statens vegvesen";
      compare(finding.code === "BRAND_MISMATCH" ? "Vehicle brand" : "Vehicle model", finding.code === "BRAND_MISMATCH" ? row?.data.make : row?.data.model, finding.code === "BRAND_MISMATCH" ? data?.make : data?.model);
      result.note = "Case, spacing and punctuation are ignored. Naming differences may still explain this finding.";
      break;
    case "AGREEMENT_PERIOD_NOT_COVERED":
      result.comparison.leftLabel = "Supplier reporting period"; result.comparison.rightLabel = "Agreement / vehicle list";
      compare("Period", period(row?.data.periodStart, row?.data.periodEnd), check.agreement ? period(check.agreement.agreement.startDate, check.agreement.agreement.endDate) : "No agreement linked");
      break;
    case "OVERLAPPING_STATISTICS":
      result.comparison.leftLabel = "Reporting row 1"; result.comparison.rightLabel = "Reporting row 2";
      compare("Period", period(row?.data.periodStart, row?.data.periodEnd), period(otherRow?.data.periodStart, otherRow?.data.periodEnd));
      compare("Distance", number(row?.data.totalTripKm, "km"), number(otherRow?.data.totalTripKm, "km"));
      result.note = "Both rows remain stored. Overlap may be intentional; their totals are not automatically added together.";
      break;
    case "REGISTRY_CO2_DISAGREEMENT":
      result.comparison.leftLabel = "Registry CO₂ measurement"; result.comparison.rightLabel = "Rounded comparison value";
      for (const m of fuel?.measurements ?? []) if (m.co2GramsPerKm != null)
        compare(m.measurementMethod?.code ?? "Method not recorded", number(m.co2GramsPerKm, "g/km"), whole(m.co2GramsPerKm, "g/km"));
      result.note = "No method is preferred here. Different test methods can explain differing figures.";
      break;
    case "CO2_CLASSIFICATION_MISMATCH": {
      const electricOrHydrogen = data?.fuels.length && data.fuels.every(f => f.fuelTechnology?.code === "5" || f.fuelTechnology?.code === "6");
      compare("Registered as CO₂-emitting", row ? row.data.co2Registered ? "Yes" : "No" : null, electricOrHydrogen ? "No under the electric/hydrogen reporting rule" : "A positive registry CO₂ measurement is recorded");
      for (const f of data?.fuels ?? []) {
        compare("Fuel technology", row ? catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology) : null, fuelLabel(f.fuelTechnology));
        for (const m of f.measurements) if (m.co2GramsPerKm != null) compare(`CO₂ (${m.measurementMethod?.code ?? "unknown method"})`, row && statisticNotApplicable("co2GramsPerKm", row.data.fuelTechnology) ? "Not applicable" : number(row?.data.co2GramsPerKm, "g/km"), number(m.co2GramsPerKm, "g/km"));
      }
      result.note = "Electric/hydrogen No is an agreed reporting convention, not a claim about lifecycle emissions.";
      break;
    }
    case "UNABLE_TO_VERIFY": {
      const noxDenominatorProblem = row?.data.totalKmNoxRegistered != null && decimalParts(row.data.totalKmNoxRegistered)?.coefficient === 0n && (decimalParts(row.data.totalNoxRegisteredGrams ?? "")?.coefficient ?? 0n) > 0n;
      const fuelDenominatorProblem = row && decimalParts(row.data.totalTripKm)?.coefficient === 0n && ((decimalParts(row.data.fuelConsumedLitres ?? "")?.coefficient ?? 0n) > 0n || (decimalParts(row.data.averageFuelConsumptionLitresPer100Km ?? "")?.coefficient ?? 0n) > 0n);
      if (row && (noxDenominatorProblem || fuelDenominatorProblem)) {
        result.comparison.leftLabel = "Supplier reporting row"; result.comparison.rightLabel = "Calculation requirement";
        if (noxDenominatorProblem) {
          compare("NOx-registered distance", number(row.data.totalKmNoxRegistered, "km"), "Greater than 0 km to calculate mg/km");
          compare("Total NOx", number(row.data.totalNoxRegisteredGrams, "g"), "A positive mass needs a usable distance for this calculation");
        }
        if (fuelDenominatorProblem) {
          compare("Total distance", number(row.data.totalTripKm, "km"), "Greater than 0 km to calculate L/100km");
          compare("Total fuel consumed", number(row.data.fuelConsumedLitres, "L"), "Cannot derive a consumption rate without distance");
        }
        result.note = "Division by zero is undefined. The missing calculated rate must not be substituted with zero.";
        break;
      }
      compare("Registry lookup", "A successful lookup with the required reference facts", check.registry.lookupOutcome);
      compare("Registry data source", "Usable reference data", check.registry.dataSource);
      compare("Registry fetched (UTC)", "Reference facts available at the saved check time", check.registry.fetchedAt);
      if (row) {
        compare("Fuel technology", catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology), data?.fuels.map(f => fuelLabel(f.fuelTechnology)).join("\n") || null);
        result.inputs = [["Total distance", number(row.data.totalTripKm, "km")], ["NOx-registered distance", statisticNotApplicable("totalKmNoxRegistered", row.data.fuelTechnology) ? "Not applicable" : number(row.data.totalKmNoxRegistered, "km")], ["Total NOx", statisticNotApplicable("totalNoxRegisteredGrams", row.data.fuelTechnology) ? "Not applicable" : number(row.data.totalNoxRegisteredGrams, "g")]];
        const relevant = data?.fuels.filter(f => fuelGroups(f.fuelTechnology?.code ?? "").includes(row.data.fuelTechnology));
        for (const [label, reported, reference] of [
          ["Vehicle category", catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory), data?.vehicleCategory?.code],
          ["Body style", catalogLabel(BODY_TYPES, row.data.bodyType), data?.bodyType?.code],
          ["Vehicle brand", row.data.make, data?.make], ["Vehicle model", row.data.model, data?.model],
        ]) if (!reference) compare(label!, reported, null);
        if (row.data.co2GramsPerKm != null && !relevant?.some(f => f.measurements.some(m => m.co2GramsPerKm != null))) compare("CO₂ rate", number(row.data.co2GramsPerKm, "g/km"), null);
        if (row.data.totalNoxRegisteredGrams != null && !relevant?.some(f => f.measurements.some(m => m.noxMgPerKm != null))) compare("NOx rate", number(exactRatio(row.data.totalNoxRegisteredGrams, row.data.totalKmNoxRegistered, 1000n), "mg/km"), null);
      }
      result.note = "A missing reference or zero denominator prevents comparison. This is not proof that the reported value is wrong. Read the recorded reason below for this particular finding.";
      break;
    }
    default:
      if (finding.origin === "AGREEMENT") {
        result.comparison.leftLabel = "Vehicle"; result.comparison.rightLabel = "Supplier agreement";
        compare("Listed", check.vehicle.registrationNumber, check.vehicle.listed ? "In vehicle list" : "Not in vehicle list");
        compare("Agreement period", "Covers the check date", check.agreement ? period(check.agreement.agreement.startDate, check.agreement.agreement.endDate) : "No agreement linked");
      } else {
        result.comparison.leftLabel = "Expected registration"; result.comparison.rightLabel = "Statens vegvesen";
        compare("Registration status", "Registered", data?.registrationStatus ?? check.registry.registrationStatus);
      }
  }
  return result;
}
