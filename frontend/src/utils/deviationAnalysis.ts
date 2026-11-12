import { vehicleDate } from "./vehicle";
import type { DeviationFinding, RegistryCode, VehicleCheck } from "../types/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel, categoryGroup, fuelGroups, statisticNotApplicable } from "./vehicleCatalog";

const missing = "Ikke tilgjengelig i denne lagrede kontrollen";
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
  ? catalogLabel(FUEL_TECHNOLOGIES, value.code) : `${value.code} — ${value.name ?? "Ikke gjenkjent drivstoffteknologi"}` : missing;

const plain = (value?: string | null) => value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ") : value;

const titles: Record<string, string> = {
  NOT_ON_AGREEMENT_LIST: "Kjøretøyet er ikke på avtalens kjøretøyliste", AGREEMENT_NOT_STARTED: "Leverandørens avtale har ikke startet",
  AGREEMENT_EXPIRED: "Leverandørens avtale er avsluttet", AGREEMENT_PERIOD_NOT_COVERED: "Rapporteringsperioden går utenfor avtalen",
  FUEL_MISMATCH: "Drivstoffteknologiene samsvarer ikke", CATEGORY_MISMATCH: "Kjøretøykategoriene samsvarer ikke",
  BODY_TYPE_MISMATCH: "Oppgitt karosseritype avviker fra Statens vegvesen", BRAND_MISMATCH: "Kjøretøymerkene samsvarer ikke", MODEL_MISMATCH: "Kjøretøymodellene samsvarer ikke",
  CO2_CLASSIFICATION_MISMATCH: "Klassifiseringen som CO₂-utslipp samsvarer ikke", CO2_MISMATCH: "Oppgitt CO₂-utslipp samsvarer ikke",
  REGISTRY_CO2_DISAGREEMENT: "CO₂-målingene i registeret avviker", NOX_MISMATCH: "NOx-verdiene samsvarer ikke",
  CONSUMPTION_MISMATCH: "Drivstofforbruket samsvarer ikke", OVERLAPPING_STATISTICS: "Rapporteringsperiodene overlapper",
  UNABLE_TO_VERIFY: "Noe informasjon kunne ikke verifiseres", DEREGISTERED: "Kjøretøyet er avregistrert", EXPORTED: "Kjøretøyet er eksportert",
  SCRAPPED: "Kjøretøyet er vraket", UNREGISTERED: "Kjøretøyet er ikke registrert", UNKNOWN_REGISTRATION_STATUS: "Registreringsstatus er ukjent",
};

/** Project existing saved evidence only. No API calls, description parsing or new compliance decisions. */
export function analyzeDeviation(finding: DeviationFinding, check: VehicleCheck): DeviationAnalysis {
  const row = check.tripRows.find(r => r.id === finding.tripRowId);
  const otherRow = check.tripRows.find(r => r.id === finding.relatedTripRowId);
  const data = check.registry.data;
  const fuel = finding.fuelIndex == null ? undefined : data?.fuels[finding.fuelIndex];
  const measurement = finding.measurementIndex == null ? undefined : fuel?.measurements[finding.measurementIndex];
  const method = measurement?.measurementMethod?.code ?? "metode ikke registrert";
  const result: DeviationAnalysis = { title: titles[finding.code] ?? finding.code.toLowerCase().replace(/_/g, " "),
    explanation: finding.description, comparison: { leftLabel: "Oppgitt / forventet", rightLabel: "Lagret referanse", rows: [] } };
  const compare = (label: string, left: string | null | undefined, right: string | null | undefined) => result.comparison.rows.push({ label, left: left ?? missing, right: right ?? missing });
  const period = (start?: string | null, end?: string | null) => start ? `${vehicleDate(start)} til ${end ? vehicleDate(end) : "uten sluttdato"}` : missing;
  switch (finding.code) {
    case "NOX_MISMATCH": {
      result.explanation = "Leverandørens samlede NOx omregnes fra gram til milligram per kilometer og sammenlignes deretter med verdien i registeret.";
      result.comparison.leftLabel = "Leverandørens statistikk (beregnet)"; result.comparison.rightLabel = `Statens vegvesen (${method})`;
      const calculated = exactRatio(row?.data.totalNoxRegisteredGrams, row?.data.totalKmNoxRegistered, 1000n);
      compare("NOx-verdi", number(calculated, "mg/km"), number(measurement?.noxMgPerKm, "mg/km"));
      compare("Verdier brukt i sammenligningen (avrundet)", number(exactRatio(row?.data.totalNoxRegisteredGrams, row?.data.totalKmNoxRegistered, 1000n, 0), "mg/km"), whole(measurement?.noxMgPerKm, "mg/km"));
      result.inputs = [["Leverandørens samlede NOx", number(row?.data.totalNoxRegisteredGrams, "g")], ["NOx-registrert distanse", number(row?.data.totalKmNoxRegistered, "km")]];
      result.note = "Beregning: samlede gram NOx × 1000 ÷ NOx-registrert distanse. Testverdier i registeret og verdier for perioden er ikke likeverdige målinger, så dette avviket må vurderes. Beregnede visningsverdier har opptil seks desimaler, mens sammenligningene bruker nøyaktig heltallsavrunding.";
      break;
    }
    case "CO2_MISMATCH":
      result.explanation = "Leverandørens CO₂-utslipp og denne målingen i registeret rundes av til ulike heltall.";
      result.comparison.leftLabel = "Leverandørens statistikk"; result.comparison.rightLabel = `Statens vegvesen (${method})`;
      compare("CO₂-utslipp", number(row?.data.co2GramsPerKm, "g/km"), number(measurement?.co2GramsPerKm, "g/km"));
      compare("Verdier brukt i sammenligningen (avrundet)", whole(row?.data.co2GramsPerKm, "g/km"), whole(measurement?.co2GramsPerKm, "g/km"));
      result.note = "Alle relevante målinger i registeret kontrolleres, selv om en annen måling stemmer. Ulike målemetoder kan forklare et avvik.";
      break;
    case "CONSUMPTION_MISMATCH":
      result.explanation = "Oppgitt gjennomsnitt stemmer ikke med et gjennomsnitt beregnet ut fra liter og distanse på denne raden.";
      result.comparison.leftLabel = "Leverandørens oppgitte gjennomsnitt"; result.comparison.rightLabel = "Beregnet ut fra leverandørens totaler";
      compare("Gjennomsnittlig drivstofforbruk", number(row?.data.averageFuelConsumptionLitresPer100Km, "L/100km"), number(exactRatio(row?.data.fuelConsumedLitres, row?.data.totalTripKm, 100n), "L/100km"));
      compare("Verdier brukt i sammenligningen (avrundet)", whole(row?.data.averageFuelConsumptionLitresPer100Km, "L/100km"), number(exactRatio(row?.data.fuelConsumedLitres, row?.data.totalTripKm, 100n, 0), "L/100km"));
      result.inputs = [["Totalt drivstofforbruk", number(row?.data.fuelConsumedLitres, "L")], ["Total distanse", number(row?.data.totalTripKm, "km")]];
      result.note = "Beregning: liter × 100 ÷ total distanse. Dette forutsetter at begge totalene gjelder samme rapporteringsomfang. Beregnet visning har opptil seks desimaler, mens heltallssammenligningene beregnes direkte fra totalene.";
      break;
    case "BODY_TYPE_MISMATCH":
      result.explanation = "Oppgitt karosseritype avviker fra registrert karosseritype. Karosseritype er noe annet enn teknisk kjøretøykategori.";
      result.comparison.leftLabel = "Leverandørens statistikk"; result.comparison.rightLabel = "Statens vegvesen";
      compare("Karosseritype", row ? catalogLabel(BODY_TYPES, row.data.bodyType) : null, data?.bodyType ? catalogLabel(BODY_TYPES, data.bodyType.code) : null);
      break;
    case "FUEL_MISMATCH":
      result.comparison.leftLabel = "Leverandørens statistikk"; result.comparison.rightLabel = "Statens vegvesen";
      compare("Drivstoffteknologi", row ? catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology) : null, data?.fuels.map(f => fuelLabel(f.fuelTechnology)).join("\n") || null);
      result.note = "De avtalte gassvariantene er slått sammen, men CNG og LNG holdes adskilt. Registerets opprinnelige koder beholdes.";
      break;
    case "CATEGORY_MISMATCH":
      result.comparison.leftLabel = "Leverandørens statistikk"; result.comparison.rightLabel = "Statens vegvesen";
      compare("Kjøretøykategori", row ? catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory) : null, data?.vehicleCategory ? catalogLabel(VEHICLE_CATEGORIES, categoryGroup(data.vehicleCategory.code)) : null);
      if (data?.vehicleCategory) compare("Opprinnelig registerkode", "Sammenlignet med normalisert kategori", data.vehicleCategory.code);
      break;
    case "BRAND_MISMATCH": case "MODEL_MISMATCH":
      result.comparison.leftLabel = "Leverandørens statistikk"; result.comparison.rightLabel = "Statens vegvesen";
      compare(finding.code === "BRAND_MISMATCH" ? "Kjøretøymerke" : "Kjøretøymodell", finding.code === "BRAND_MISMATCH" ? row?.data.make : row?.data.model, finding.code === "BRAND_MISMATCH" ? data?.make : data?.model);
      result.note = "Store og små bokstaver, mellomrom og tegnsetting ignoreres. Forskjellig navnsetting kan likevel forklare dette funnet.";
      break;
    case "AGREEMENT_PERIOD_NOT_COVERED":
      result.comparison.leftLabel = "Leverandørens rapporteringsperiode"; result.comparison.rightLabel = "Avtale / kjøretøyliste";
      compare("Periode", period(row?.data.periodStart, row?.data.periodEnd), check.agreement ? period(check.agreement.agreement.startDate, check.agreement.agreement.endDate) : "Ingen avtale koblet");
      break;
    case "OVERLAPPING_STATISTICS":
      result.comparison.leftLabel = "Rapporteringsrad 1"; result.comparison.rightLabel = "Rapporteringsrad 2";
      compare("Periode", period(row?.data.periodStart, row?.data.periodEnd), period(otherRow?.data.periodStart, otherRow?.data.periodEnd));
      compare("Distanse", number(row?.data.totalTripKm, "km"), number(otherRow?.data.totalTripKm, "km"));
      result.note = "Begge radene er lagret. Overlappet kan være tilsiktet, og totalene legges ikke automatisk sammen.";
      break;
    case "REGISTRY_CO2_DISAGREEMENT":
      result.comparison.leftLabel = "CO₂-måling i registeret"; result.comparison.rightLabel = "Avrundet sammenligningsverdi";
      for (const m of fuel?.measurements ?? []) if (m.co2GramsPerKm != null)
        compare(m.measurementMethod?.code ?? "Metode ikke registrert", number(m.co2GramsPerKm, "g/km"), whole(m.co2GramsPerKm, "g/km"));
      result.note = "Ingen metode foretrekkes her. Ulike testmetoder kan forklare forskjellige verdier.";
      break;
    case "CO2_CLASSIFICATION_MISMATCH": {
      const electricOrHydrogen = data?.fuels.length && data.fuels.every(f => f.fuelTechnology?.code === "5" || f.fuelTechnology?.code === "6");
      compare("Registrert som CO₂-utslipp", row ? row.data.co2Registered ? "Ja" : "Nei" : null, electricOrHydrogen ? "Nei etter rapporteringsregelen for elektrisk/hydrogen" : "En positiv CO₂-måling er registrert i registeret");
      for (const f of data?.fuels ?? []) {
        compare("Drivstoffteknologi", row ? catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology) : null, fuelLabel(f.fuelTechnology));
        for (const m of f.measurements) if (m.co2GramsPerKm != null) compare(`CO₂ (${m.measurementMethod?.code ?? "ukjent metode"})`, row && statisticNotApplicable("co2GramsPerKm", row.data.fuelTechnology) ? "Ikke relevant" : number(row?.data.co2GramsPerKm, "g/km"), number(m.co2GramsPerKm, "g/km"));
      }
      result.note = "Nei for elektrisk/hydrogen er en avtalt rapporteringspraksis og ikke en påstand om utslipp over livssyklusen.";
      break;
    }
    case "UNABLE_TO_VERIFY": {
      const noxDenominatorProblem = row?.data.totalKmNoxRegistered != null && decimalParts(row.data.totalKmNoxRegistered)?.coefficient === 0n && (decimalParts(row.data.totalNoxRegisteredGrams ?? "")?.coefficient ?? 0n) > 0n;
      const fuelDenominatorProblem = row && decimalParts(row.data.totalTripKm)?.coefficient === 0n && ((decimalParts(row.data.fuelConsumedLitres ?? "")?.coefficient ?? 0n) > 0n || (decimalParts(row.data.averageFuelConsumptionLitresPer100Km ?? "")?.coefficient ?? 0n) > 0n);
      if (row && (noxDenominatorProblem || fuelDenominatorProblem)) {
        result.comparison.leftLabel = "Leverandørens rapporteringsrad"; result.comparison.rightLabel = "Krav til beregningen";
        if (noxDenominatorProblem) {
          compare("NOx-registrert distanse", number(row.data.totalKmNoxRegistered, "km"), "Større enn 0 km for å beregne mg/km");
          compare("Samlet NOx", number(row.data.totalNoxRegisteredGrams, "g"), "En positiv masse krever en brukbar distanse i denne beregningen");
        }
        if (fuelDenominatorProblem) {
          compare("Total distanse", number(row.data.totalTripKm, "km"), "Større enn 0 km for å beregne L/100km");
          compare("Totalt drivstofforbruk", number(row.data.fuelConsumedLitres, "L"), "Kan ikke beregne forbruk uten distanse");
        }
        result.note = "Deling på null er udefinert. Den manglende beregnede verdien skal ikke erstattes med null.";
        break;
      }
      compare("Registeroppslag", "Et vellykket oppslag med nødvendige referanseopplysninger", plain(check.registry.lookupOutcome));
      compare("Datakilde i registeret", "Brukbare referansedata", plain(check.registry.dataSource));
      compare("Register hentet (UTC)", "Referanseopplysninger tilgjengelige på tidspunktet for den lagrede kontrollen", check.registry.fetchedAt);
      if (row) {
        compare("Drivstoffteknologi", catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology), data?.fuels.map(f => fuelLabel(f.fuelTechnology)).join("\n") || null);
        result.inputs = [["Total distanse", number(row.data.totalTripKm, "km")], ["NOx-registrert distanse", statisticNotApplicable("totalKmNoxRegistered", row.data.fuelTechnology) ? "Ikke relevant" : number(row.data.totalKmNoxRegistered, "km")], ["Samlet NOx", statisticNotApplicable("totalNoxRegisteredGrams", row.data.fuelTechnology) ? "Ikke relevant" : number(row.data.totalNoxRegisteredGrams, "g")]];
        const relevant = data?.fuels.filter(f => fuelGroups(f.fuelTechnology?.code ?? "").includes(row.data.fuelTechnology));
        for (const [label, reported, reference] of [
          ["Kjøretøykategori", catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory), data?.vehicleCategory?.code],
          ["Karosseritype", catalogLabel(BODY_TYPES, row.data.bodyType), data?.bodyType?.code],
          ["Kjøretøymerke", row.data.make, data?.make], ["Kjøretøymodell", row.data.model, data?.model],
        ]) if (!reference) compare(label!, reported, null);
        if (row.data.co2GramsPerKm != null && !relevant?.some(f => f.measurements.some(m => m.co2GramsPerKm != null))) compare("CO₂-utslipp", number(row.data.co2GramsPerKm, "g/km"), null);
        if (row.data.totalNoxRegisteredGrams != null && !relevant?.some(f => f.measurements.some(m => m.noxMgPerKm != null))) compare("NOx-verdi", number(exactRatio(row.data.totalNoxRegisteredGrams, row.data.totalKmNoxRegistered, 1000n), "mg/km"), null);
      }
      result.note = "Manglende referanse eller null i nevneren hindrer sammenligning. Dette er ikke bevis på at den oppgitte verdien er feil. Les den registrerte begrunnelsen nedenfor for dette funnet.";
      break;
    }
    default:
      if (finding.origin === "AGREEMENT") {
        result.comparison.leftLabel = "Kjøretøy"; result.comparison.rightLabel = "Leverandørens avtale";
        compare("På listen", check.vehicle.registrationNumber, check.vehicle.listed ? "På kjøretøylisten" : "Ikke på kjøretøylisten");
        compare("Avtaleperiode", "Dekker kontrolldatoen", check.agreement ? period(check.agreement.agreement.startDate, check.agreement.agreement.endDate) : "Ingen avtale koblet");
      } else {
        result.comparison.leftLabel = "Forventet registrering"; result.comparison.rightLabel = "Statens vegvesen";
        compare("Registreringsstatus", "Registrert", data?.registrationStatus ?? check.registry.registrationStatus);
      }
  }
  return result;
}
