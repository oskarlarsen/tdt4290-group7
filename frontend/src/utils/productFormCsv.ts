export type ProductFormRow = {
  id: string;
  agreementId: string;
  productCode: string;
  productName: string;
  productCategory: string;
  ecolabelStandard: string;
  licenseNumber: string;
  unitOfMeasure: string;
  isRepairedOrReused: boolean | null;
  notes: string;
};

export const PRODUCT_CATEGORIES: Record<string, string> = {
  FURNITURE: "Møbler",
  IT_EQUIPMENT: "IT-utstyr",
  FOOD_BEVERAGE: "Mat og drikke",
  CLEANING_SUPPLIES: "Rengjøringsmidler",
  OTHER: "Annet",
};

export const ECOLABEL_STANDARDS: Record<string, string> = {
  NORDIC_SWAN: "Svanemerket (Nordic Swan)",
  EU_ECOLABEL: "EU Ecolabel",
  MOBELFAKTA: "Møbelfakta",
  BLUE_ANGEL: "Blue Angel (Der Blaue Engel)",
  OEKO_TEX: "OEKO-TEX",
  EPD: "Miljødeklarasjon (EPD)",
  NONE: "Ingen",
};

export const UNITS_OF_MEASURE: Record<string, string> = {
  PCS: "Stykk (stk)",
  KG: "Kilogram (kg)",
  LITRE: "Liter (L)",
};

export const PRODUCT_CSV_HEADERS = [
  "agreement_id",
  "product_code",
  "product_name",
  "product_category",
  "ecolabel_standard",
  "license_number",
  "unit_of_measure",
  "is_repaired_or_reused",
  "notes",
] as const;

function csvCell(value: string) {
  const singleLine = value.replace(/\r\n?|\n/g, " ");
  return /[;\r\n"]/.test(singleLine) ? `"${singleLine.replace(/"/g, '""')}"` : singleLine;
}

export function productRowsToCsv(rows: ProductFormRow[]) {
  const serializeBoolean = (value: boolean | null) => (value === null ? "" : String(value).toUpperCase());
  const data = rows.map((row) => [
    row.agreementId,
    row.productCode,
    row.productName,
    row.productCategory,
    row.ecolabelStandard,
    row.licenseNumber,
    row.unitOfMeasure,
    serializeBoolean(row.isRepairedOrReused),
    row.notes,
  ]);
  return [PRODUCT_CSV_HEADERS, ...data]
    .map((record) => record.map((value) => csvCell(value)).join(";"))
    .join("\r\n") + "\r\n";
}

export function createProductFormRow(): ProductFormRow {
  return {
    id: crypto.randomUUID(),
    agreementId: "",
    productCode: "",
    productName: "",
    productCategory: "",
    ecolabelStandard: "NONE",
    licenseNumber: "",
    unitOfMeasure: "PCS",
    isRepairedOrReused: false,
    notes: "",
  };
}
