import type { CheckSummary, RegistryCode, VehicleCheck, StatisticsSave } from "../types/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, isTrailer, selectedCode, statisticNotApplicable, emissionsNotApplicable, INAPPLICABLE_EMISSION_FIELDS } from "./vehicleCatalog";

export const DECIMAL_FIELDS = [
  ["totalTripKm", "Total distanse (km)"], ["co2GramsPerKm", "Leverandørens CO₂ (g/km)"],
  ["averageFuelConsumptionLitresPer100Km", "Gjennomsnittlig drivstofforbruk (L/100km)"],
  ["fuelConsumedLitres", "Totalt drivstofforbruk (L)"], ["totalKmNoxRegistered", "NOx-registrert distanse (km)"],
  ["totalNoxRegisteredGrams", "Totalt registrert NOx (g)"], ["totalKmCo2Registered", "CO₂-registrert distanse (km)"],
  ["totalKmCo2NotRegistered", "Distanse uten registrert CO₂ (km)"],
  ["totalKmFuelRegistered", "Drivstoffregistrert distanse (km)"], ["kmFuelNotRegistered", "Distanse uten registrert drivstoff (km)"],
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
  if (!/^[A-Z]{2}[1-9][0-9]{3,4}$/.test(plate)) throw new Error("Skriv inn to bokstaver etterfulgt av fire eller fem sifre, uten innledende null.");
  return plate;
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Keep exact decimal literals through input -> JSON -> BigDecimal. Do not use Number(). */
export function decimalLiteral(value: string, label: string): string {
  const input = value.trim();
  if (input.length > 80) throw new Error(`${label}: skriv inn maks 80 tegn.`);
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error(`${label}: skriv inn et tall som ikke er negativt, med punktum som desimaltegn (f.eks. 12.34).`);
  const [whole, fraction = ""] = input.split(".");
  const significantFraction = fraction.replace(/0+$/, "");
  const coefficient = BigInt(whole + significantFraction);
  if (significantFraction.length > 18 || coefficient > 9223372036854775807n)
    throw new Error(`${label}: tallet overskrider støttet presisjon eller verdiområde.`);
  return whole.replace(/^0+(?=\d)/, "") + (significantFraction ? `.${significantFraction}` : "");
}

/** Exact preview of the backend calculation; never sent as an editable request field. */
export function estimatedCo2Preview(distance: string, rate: string): string {
  try {
    const [kmWhole, kmFraction = ""] = decimalLiteral(distance, "Distanse").split(".");
    const [rateWhole, rateFraction = ""] = decimalLiteral(rate, "CO₂-utslipp").split(".");
    const coefficient = BigInt(kmWhole + kmFraction) * BigInt(rateWhole + rateFraction);
    const scale = kmFraction.length + rateFraction.length + 3;
    const digits = coefficient.toString().padStart(scale + 1, "0");
    const fraction = digits.slice(-scale).replace(/0+$/, "");
    return digits.slice(0, -scale) + (fraction ? `.${fraction}` : "");
  } catch { return ""; }
}

export function statisticsBody(values: Record<string, string>): string {
  const plate = validPlate(values.registrationNumber ?? "");
  if (!validDate(values.periodStart) || !validDate(values.periodEnd)) throw new Error("Begge rapporteringsdatoene må være gyldige datoer (ÅÅÅÅ-MM-DD).");
  if (values.periodEnd < values.periodStart) throw new Error("Periodeslutt kan ikke være før periodestart.");
  const fuel = selectedCode(FUEL_TECHNOLOGIES, values.fuelTechnology ?? "", "drivstoffteknologi");
  const category = selectedCode(VEHICLE_CATEGORIES, values.vehicleCategory ?? "", "kjøretøykategori");
  selectedCode(BODY_TYPES, values.bodyType ?? "", "karosseritype");
  if (emissionsNotApplicable(fuel) && (values.co2Registered !== "false" || INAPPLICABLE_EMISSION_FIELDS.some(key => values[key]?.trim())))
    throw new Error("Statistikk for elektrisk/hydrogen krever at CO₂-utslipp ikke er avkrysset, og at CO₂/NOx-verdier og registrerte distanser er ikke relevante.");
  if (isTrailer(category) !== (fuel === "NOT_APPLICABLE")) throw new Error("Bruk Ikke relevant som drivstoff nøyaktig for tilhengerkategoriene O1–O4.");
  const row: string[] = [
    `"registrationNumber":${JSON.stringify(plate)}`, `"periodStart":${JSON.stringify(values.periodStart)}`, `"periodEnd":${JSON.stringify(values.periodEnd)}`,
  ];
  for (const key of ["fuelTechnology", "make", "vehicleCategory", "bodyType", "model"]) {
    if (!values[key]?.trim()) throw new Error(`${key} er påkrevd.`);
    row.push(`${JSON.stringify(key)}:${JSON.stringify(values[key].trim())}`);
  }
  for (const key of ["comment"]) {
    if (values[key]?.trim()) row.push(`${JSON.stringify(key)}:${JSON.stringify(values[key].trim())}`);
  }
  for (const [key, label] of DECIMAL_FIELDS) {
    if (statisticNotApplicable(key, fuel)) {
      if (values[key]?.trim()) throw new Error(`${label} er ikke relevant for denne drivstoffteknologien.`);
      row.push(`${JSON.stringify(key)}:null`);
    } else {
      if (!values[key]?.trim()) throw new Error(`${label} er påkrevd.`);
      row.push(`${JSON.stringify(key)}:${decimalLiteral(values[key], label)}`);
    }
  }
  if (!["true", "false"].includes(values.co2Registered)) throw new Error("Velg om kjøretøyet er registrert som CO₂-utslipp.");
  row.push(`"co2Registered":${values.co2Registered === "true"}`);
  if (!values.agreementId) throw new Error("Velg hvilken avtale dataene gjelder.");
  return `{"sourceName":${JSON.stringify(values.sourceName?.trim() || null)},"agreementId":${JSON.stringify(values.agreementId)},"rows":[{${row.join(",")}}]}`;
}

export function checkLabel(check?: CheckSummary | null): string {
  if (!check) return "Ikke kontrollert";
  const total = (check.highPriorityCount ?? 0) + (check.moderatePriorityCount ?? 0);
  if (total) return `${total} avvik (${check.highPriorityCount ?? 0} høy, ${check.moderatePriorityCount ?? 0} moderat)`;
  if (check.deviations.length) return `${check.deviations.length} registrert${check.deviations.length === 1 ? "" : "e"} avvik`;
  if (check.dataSource === "UNAVAILABLE" || check.lookupOutcome !== "FOUND") return "Verifisering ufullstendig";
  if (check.dataSource === "STALE_CACHE") return "Utdatert verifisering";
  return "Ingen registrerte avvik";
}
export function summaryOf(check: VehicleCheck): CheckSummary {
  return { ...check.registry, id: check.id, checkedAt: check.checkedAt, deviations: check.deviations,
    highPriorityCount: (check.findings ?? []).filter(f => f.priority === "HIGH").length,
    moderatePriorityCount: (check.findings ?? []).filter(f => f.priority === "MODERATE").length };
}
export function statisticsSaveMessage(result: StatisticsSave, plate: string): string {
  const outcome = result.checks.find(item => item.registrationNumber === plate);
  if (outcome?.error) return outcome.error;
  if (!outcome?.check) return "Statistikken er lagret, men verifiseringen ble ikke returnert. Kjør en kontroll fra kjøretøydetaljene; ikke send statistikken på nytt.";
  const checked = outcome.check;
  const registry = checked.dataSource === "UNAVAILABLE" || checked.lookupOutcome !== "FOUND"
    ? `Verifisering mot Statens vegvesen er ufullstendig (${humanize(checked.lookupOutcome)}).`
    : checked.dataSource === "STALE_CACHE" ? "Verifiseringen mot Statens vegvesen bruker utdaterte data; oppdateringen mislyktes." : `Data fra Statens vegvesen: ${humanize(checked.dataSource)}.`;
  return `Statistikken er lagret og automatisk kontroll er registrert: ${checkLabel(checked)}. ${registry}`;
}
export function humanize(value: string): string { return value.toLowerCase().replace(/_/g, " "); }
export function timestamp(value?: string | null): string { return value ? new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Oslo" }).format(new Date(value)) : "Ikke tilgjengelig"; }
export function codeLabel(value?: RegistryCode | null): string { return value ? `${value.name ?? value.code}${value.name ? ` (${value.code})` : ""}` : "Ikke oppgitt"; }

export function vehicleDate(value: string): string { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" }) : value; }
export function agreementDuration(start: string, end: string): string {
  if (!validDate(start) || !validDate(end) || end < start) return "";
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return `${days} ${days === 1 ? "dag" : "dager"}`;
}
