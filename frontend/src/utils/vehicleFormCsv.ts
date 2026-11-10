export type VehicleFormRow = {
  id: string;
  agreementId: string;
  registrationNumber: string;
  isPlanned: boolean | null;
  fuelTechnology: string;
  isHybrid: boolean | null;
  fullContractCoverage: boolean | null;
  startYearWeek: string;
  endYearWeek: string;
  attachmentReference: string;
  notes: string;
};

export const VEHICLE_CSV_HEADERS = [
  "agreement_id",
  "registration_number",
  "is_planned",
  "fuel_technology",
  "is_hybrid",
  "full_contract_coverage",
  "start_year_week",
  "end_year_week",
  "attachment_reference",
  "notes",
] as const;

function csvCell(value: string) {
  const singleLine = value.replace(/\r\n?|\n/g, " ");
  return /[;\r\n"]/.test(singleLine) ? `"${singleLine.replace(/"/g, '""')}"` : singleLine;
}

export function vehicleRowsToCsv(rows: VehicleFormRow[]) {
  const serializeBoolean = (value: boolean | null) => value === null ? "" : String(value).toUpperCase();
  const data = rows.map((row) => [
    row.agreementId,
    row.registrationNumber,
    serializeBoolean(row.isPlanned),
    row.fuelTechnology,
    serializeBoolean(row.isHybrid),
    serializeBoolean(row.fullContractCoverage),
    row.startYearWeek,
    row.endYearWeek,
    row.attachmentReference,
    row.notes,
  ]);
  return [VEHICLE_CSV_HEADERS, ...data]
    .map((record) => record.map((value) => csvCell(value)).join(";"))
    .join("\r\n") + "\r\n";
}

export function createVehicleFormRow(): VehicleFormRow {
  return {
    id: crypto.randomUUID(),
    agreementId: "",
    registrationNumber: "",
    isPlanned: null,
    fuelTechnology: "",
    isHybrid: null,
    fullContractCoverage: null,
    startYearWeek: "",
    endYearWeek: "",
    attachmentReference: "",
    notes: "",
  };
}
