// Official Statens vegvesen codes with application-owned Norwegian labels. Keep in sync with VehicleCatalog.kt.
export const FUEL_TECHNOLOGIES = {
  "1": "Bensin",
  "2": "Diesel",
  "3": "Parafin",
  "4": "Gass",
  "5": "Elektrisk",
  "6": "Hydrogen",
  "7": "Bensinhybrid",
  "8": "Dieselhybrid",
  "9": "Annet drivstoff",
  "10": "Biodiesel",
  "11": "Biobensin",
  "12": "LPG",
  "13": "CNG",
  "14": "Metanol",
  "21": "LNG",
  "NOT_APPLICABLE": "Ikke relevant - tilhenger uten motor",
} as const;

export const VEHICLE_CATEGORIES = {
  "M1": "Personbil",
  "M2": "Buss, tillatt totalvekt opptil 5 000 kg",
  "M3": "Buss, tillatt totalvekt over 5 000 kg",
  "N1": "Varebil, tillatt totalvekt opptil 3 500 kg",
  "N2": "Lastebil, tillatt totalvekt over 3 500 til 12 000 kg",
  "N3": "Lastebil, tillatt totalvekt over 12 000 kg",
  "O1": "Tilhenger, tillatt totalvekt opptil 750 kg",
  "O2": "Tilhenger, over 750 til 3 500 kg",
  "O3": "Tilhenger, over 3 500 til 10 000 kg",
  "O4": "Tilhenger, over 10 000 kg",
} as const;

// Maximum permitted weight by registry category. Passenger cars (M1) have no weight class.
export const VEHICLE_WEIGHT_RANGES: Record<VehicleCategory, string | null> = {
  M1: null,
  M2: "opptil 5 000 kg",
  M3: "over 5 000 kg",
  N1: "opptil 3 500 kg",
  N2: "3 500 til 12 000 kg",
  N3: "over 12 000 kg",
  O1: "opptil 750 kg",
  O2: "750 til 3 500 kg",
  O3: "3 500 til 10 000 kg",
  O4: "over 10 000 kg",
};

/** The weight range for a registry category code such as N2, or null when it has none or is unknown. */
export function vehicleWeightRange(category: string | null | undefined): string | null {
  return category && category in VEHICLE_WEIGHT_RANGES ? VEHICLE_WEIGHT_RANGES[category as VehicleCategory] : null;
}

export const BODY_TYPES = {
  "AA": "Sedan",
  "AB": "Kombikupé",
  "AC": "Stasjonsvogn",
  "AD": "Kupé",
  "AE": "Kabriolet",
  "AF": "Flerbruksbil",
  "AG": "Dobbel kabin",
  "ANNET": "Annen karosseritype",
  "APEN": "Åpen karosseri",
  "BA": "Lastebil med separat førerhus",
  "BB": "Varebil med integrert førerhus",
  "BC": "Trekkbil for semitrailer",
  "BD": "Trekkbil for tilhenger",
  "BE": "Pickup",
  "BX": "Chassis med eller uten førerhus",
  "CA": "Enkeltdekkerbuss eller turbuss",
  "CB": "Dobbeltdekkerbuss eller turbuss",
  "CC": "Leddbuss, enkeltdekker, eller turbuss",
  "CD": "Leddbuss, dobbeltdekker, eller turbuss",
  "CE": "Lavgulvbuss, enkeltdekker, eller turbuss",
  "CF": "Lavgulvbuss, dobbeltdekker, eller turbuss",
  "CG": "Lavgulv leddbuss, enkeltdekker, eller turbuss",
  "CH": "Lavgulv leddbuss, dobbeltdekker, eller turbuss",
  "CI": "Åpen enkeltdekkerbuss eller turbuss",
  "CJ": "Åpen dobbeltdekkerbuss eller turbuss",
  "CM": "Lavgulvbuss, enkeltdekker",
  "CO": "Lavgulv leddbuss, enkeltdekker",
  "CQ": "Enkeltdekkerbuss",
  "CR": "Dobbeltdekkerbuss",
  "CS": "Leddbuss, enkeltdekker",
  "CT": "Leddbuss, dobbeltdekker",
  "CU": "Enkeltdekkerbuss",
  "CV": "Lavgulvbuss, enkeltdekker",
  "CW": "Enkeltdekkerbuss",
  "CX": "Busschassis",
  "DA": "Semitrailer",
  "DB": "Tilhenger med dragstang",
  "DC": "Sentralakslet tilhenger",
  "DE": "Tilhenger med stiv dragstang",
  "HARDTOP": "Hardtop",
  "IKKE_FORERVERN": "Ingen førervern",
  "IKKE_KAROSSERI": "Ingen karosseri",
  "LUKKET": "Lukket karosseri",
  "LUKKET_FORERVERN": "Lukket førervern",
  "SA": "Bobil",
  "SB": "Pansret kjøretøy",
  "SC": "Ambulanse",
  "SD": "Likbil",
  "SE": "Campingvogn",
  "SF": "Mobilkran",
  "SG": "Spesialkjøretøy",
  "SH": "Rullestolegnet kjøretøy",
  "SJ": "Dolly",
  "SK": "Spesialtilhenger for overmål",
  "SL": "Terminaltraktor",
  "SM": "Lastebil for utskiftbart utstyr",
  "VELTEBOYLE": "Veltebøyle",
} as const;

export type FuelTechnology = keyof typeof FUEL_TECHNOLOGIES;
export type VehicleCategory = keyof typeof VEHICLE_CATEGORIES;
export type BodyType = keyof typeof BODY_TYPES;

export function isTrailer(category: string): boolean { return ["O1", "O2", "O3", "O4"].includes(category); }
export function usesLitres(fuel: string): boolean { return !["5", "6", "NOT_APPLICABLE"].includes(fuel); }
export function emissionsNotApplicable(fuel: string): boolean { return ["5", "6"].includes(fuel); }
export const INAPPLICABLE_EMISSION_FIELDS = ["co2GramsPerKm", "totalNoxRegisteredGrams", "totalKmCo2Registered", "totalKmNoxRegistered"] as const;
export function statisticNotApplicable(key: string, fuel: string): boolean {
  return (["averageFuelConsumptionLitresPer100Km", "fuelConsumedLitres"].includes(key) && !usesLitres(fuel)) ||
    ((INAPPLICABLE_EMISSION_FIELDS as readonly string[]).includes(key) && emissionsNotApplicable(fuel));
}
export function fuelGroups(code: string): string[] {
  if (["16", "17"].includes(code)) return ["12"];
  if (["18", "19"].includes(code)) return ["13"];
  return code === "22" ? ["13", "21"] : [code];
}
export function categoryGroup(code: string): string {
  return ["M1G", "M2G", "M3G", "N1G", "N2G", "N3G"].includes(code) ? code.slice(0, -1) : code;
}
export function catalogLabel(catalog: Readonly<Record<string, string>>, code?: string | null): string {
  if (!code) return "Ikke oppgitt";
  if (code === "NOT_APPLICABLE") return catalog[code];
  return `${code} - ${catalog[code] ?? "Ukjent kode"}`;
}
export function selectedCode<T extends Readonly<Record<string, string>>>(catalog: T, code: string, label: string): keyof T & string {
  if (!Object.prototype.hasOwnProperty.call(catalog, code)) throw new Error(`Velg gyldig ${label}.`);
  return code as keyof T & string;
}
