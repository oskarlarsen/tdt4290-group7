// Official SVV codes with application-owned English labels. Keep in sync with VehicleCatalog.kt.
export const FUEL_TECHNOLOGIES = {
  "1": "Gasoline",
  "2": "Diesel",
  "3": "Kerosene",
  "4": "Gas",
  "5": "Electric",
  "6": "Hydrogen",
  "7": "Gasoline hybrid",
  "8": "Diesel hybrid",
  "9": "Other fuel",
  "10": "Biodiesel",
  "11": "Biogasoline",
  "12": "LPG",
  "13": "CNG",
  "14": "Methanol",
  "15": "Ethanol",
  "16": "LPG A",
  "17": "LPG B",
  "18": "CNG 20",
  "19": "CNG 25",
  "20": "Compressed air",
  "21": "LNG",
  "22": "CNG and LNG",
  "NOT_APPLICABLE": "Not applicable - unpowered trailer",
} as const;

export const VEHICLE_CATEGORIES = {
  "M1": "Passenger car",
  "M1G": "Off-road passenger car",
  "M2": "Bus, maximum permitted weight up to 5,000 kg",
  "M2G": "Off-road bus, up to 5,000 kg",
  "M3": "Bus, maximum permitted weight over 5,000 kg",
  "M3G": "Off-road bus, over 5,000 kg",
  "N1": "Van, maximum permitted weight up to 3,500 kg",
  "N1G": "Off-road van, up to 3,500 kg",
  "N2": "Truck, maximum permitted weight over 3,500 to 12,000 kg",
  "N2G": "Off-road truck, over 3,500 to 12,000 kg",
  "N3": "Truck, maximum permitted weight over 12,000 kg",
  "N3G": "Off-road truck, over 12,000 kg",
  "O1": "Trailer, maximum permitted weight up to 750 kg",
  "O2": "Trailer, over 750 to 3,500 kg",
  "O3": "Trailer, over 3,500 to 10,000 kg",
  "O4": "Trailer, over 10,000 kg",
} as const;

export const BODY_TYPES = {
  "AA": "Sedan",
  "AB": "Hatchback",
  "AC": "Station wagon",
  "AD": "Coupe",
  "AE": "Convertible",
  "AF": "Multi-purpose vehicle",
  "AG": "Double cab",
  "ANNET": "Other body type",
  "APEN": "Open body",
  "BA": "Truck with separate cab",
  "BB": "Van with integrated cab",
  "BC": "Semi-trailer tractor",
  "BD": "Trailer tractor",
  "BE": "Pickup",
  "BX": "Chassis with or without cab",
  "CA": "Single-deck bus or coach",
  "CB": "Double-deck bus or coach",
  "CC": "Single-deck articulated bus or coach",
  "CD": "Double-deck articulated bus or coach",
  "CE": "Single-deck low-floor bus or coach",
  "CF": "Double-deck low-floor bus or coach",
  "CG": "Single-deck articulated low-floor bus or coach",
  "CH": "Double-deck articulated low-floor bus or coach",
  "CI": "Open single-deck bus or coach",
  "CJ": "Open double-deck bus or coach",
  "CM": "Single-deck low-floor bus",
  "CO": "Single-deck articulated low-floor bus",
  "CQ": "Single-deck bus",
  "CR": "Double-deck bus",
  "CS": "Single-deck articulated bus",
  "CT": "Double-deck articulated bus",
  "CU": "Single-deck bus",
  "CV": "Single-deck low-floor bus",
  "CW": "Single-deck bus",
  "CX": "Bus chassis",
  "DA": "Semi-trailer",
  "DB": "Drawbar trailer",
  "DC": "Centre-axle trailer",
  "DE": "Rigid-drawbar trailer",
  "HARDTOP": "Hardtop",
  "IKKE_FORERVERN": "No driver protection",
  "IKKE_KAROSSERI": "No bodywork",
  "LUKKET": "Closed body",
  "LUKKET_FORERVERN": "Enclosed driver protection",
  "SA": "Motorhome",
  "SB": "Armoured vehicle",
  "SC": "Ambulance",
  "SD": "Hearse",
  "SE": "Caravan",
  "SF": "Mobile crane",
  "SG": "Special-purpose vehicle",
  "SH": "Wheelchair-accessible vehicle",
  "SJ": "Trailer dolly",
  "SK": "Oversize special trailer",
  "SL": "Terminal tractor",
  "SM": "Goods vehicle for interchangeable equipment",
  "VELTEBOYLE": "Rollover protection bar",
} as const;

export type FuelTechnology = keyof typeof FUEL_TECHNOLOGIES;
export type VehicleCategory = keyof typeof VEHICLE_CATEGORIES;
export type BodyType = keyof typeof BODY_TYPES;

export function isTrailer(category: string): boolean { return ["O1", "O2", "O3", "O4"].includes(category); }
export function usesLitres(fuel: string): boolean { return !["5", "6", "NOT_APPLICABLE"].includes(fuel); }
export function catalogLabel(catalog: Readonly<Record<string, string>>, code?: string | null): string {
  if (!code) return "Not provided";
  if (code === "NOT_APPLICABLE") return catalog[code];
  return `${code} - ${catalog[code] ?? "Unrecognised code"}`;
}
export function selectedCode<T extends Readonly<Record<string, string>>>(catalog: T, code: string, label: string): keyof T & string {
  if (!Object.prototype.hasOwnProperty.call(catalog, code)) throw new Error(`Select a valid ${label}.`);
  return code as keyof T & string;
}
