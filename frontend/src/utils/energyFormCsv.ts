export type EnergyFormRow = {
  id: string;
  agreementId: string;
  locationCode: string;
  address: string;
  reportingYear: number;
  storageAreaSqm: string;
  workshopAreaSqm: string;
  otherAreaSqm: string;
  electricityKwh: string;
  districtHeatingKwh: string;
  biogasKwh: string;
  fossilFuelKwh: string;
  selfProducedSolarKwh: string;
  selfProducedHeatpumpKwh: string;
  notes: string;
};

export const ENERGY_CSV_HEADERS = [
  "agreement_id",
  "facility_location_code",
  "facility_address",
  "storage_area_sqm",
  "workshop_area_sqm",
  "other_area_sqm",
  "reporting_year",
  "electricity_kwh",
  "district_heating_kwh",
  "biogas_kwh",
  "fossil_fuel_kwh",
  "self_produced_solar_kwh",
  "self_produced_heatpump_kwh",
  "notes",
] as const;

function csvCell(value: string) {
  const singleLine = value.replace(/\r\n?|\n/g, " ");
  return /[;\r\n"]/.test(singleLine) ? `"${singleLine.replace(/"/g, '""')}"` : singleLine;
}

export function energyRowsToCsv(rows: EnergyFormRow[]) {
  const data = rows.map((row) => [
    row.agreementId,
    row.locationCode,
    row.address,
    row.storageAreaSqm,
    row.workshopAreaSqm,
    row.otherAreaSqm,
    String(row.reportingYear),
    row.electricityKwh,
    row.districtHeatingKwh,
    row.biogasKwh,
    row.fossilFuelKwh,
    row.selfProducedSolarKwh,
    row.selfProducedHeatpumpKwh,
    row.notes,
  ]);
  return [ENERGY_CSV_HEADERS, ...data]
    .map((record) => record.map((value) => csvCell(value)).join(";"))
    .join("\r\n") + "\r\n";
}

export function createEnergyFormRow(): EnergyFormRow {
  return {
    id: crypto.randomUUID(),
    agreementId: "",
    locationCode: "",
    address: "",
    reportingYear: new Date().getFullYear(),
    storageAreaSqm: "",
    workshopAreaSqm: "",
    otherAreaSqm: "",
    electricityKwh: "",
    districtHeatingKwh: "",
    biogasKwh: "",
    fossilFuelKwh: "",
    selfProducedSolarKwh: "",
    selfProducedHeatpumpKwh: "",
    notes: "",
  };
}
