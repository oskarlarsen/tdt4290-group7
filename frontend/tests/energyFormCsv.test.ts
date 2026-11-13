import { describe, expect, it } from "vitest";
import {
  createEnergyFormRow,
  energyRowsToCsv,
  type EnergyFormRow,
} from "../src/utils/energyFormCsv";

const row: EnergyFormRow = {
  id: "energy-1",
  agreementId: "agreement-1",
  locationCode: "DEPOT-01",
  address: "Kongens gate 1, 7011 Trondheim",
  reportingYear: 2026,
  reportingQuarter: 3,
  storageAreaSqm: "500",
  workshopAreaSqm: "250",
  otherAreaSqm: "50",
  electricityKwh: "12500.5",
  districtHeatingKwh: "20000",
  biogasKwh: "1000",
  fossilFuelKwh: "0",
  selfProducedSolarKwh: "3500",
  selfProducedHeatpumpKwh: "0",
  gooCoveredKwh: "2000",
  notes: 'Main facility; "north wing"',
};

describe("energy form CSV adapter", () => {
  it("converts energy form row into formatted CSV with expected headers and delimiter", () => {
    const csv = energyRowsToCsv([row]);
    expect(csv).toBe(
      "agreement_id;facility_location_code;facility_address;storage_area_sqm;workshop_area_sqm;other_area_sqm;reporting_year;reporting_quarter;electricity_kwh;district_heating_kwh;biogas_kwh;fossil_fuel_kwh;self_produced_solar_kwh;self_produced_heatpump_kwh;goo_covered_kwh;notes\r\n" +
      'agreement-1;DEPOT-01;Kongens gate 1, 7011 Trondheim;500;250;50;2026;3;12500.5;20000;1000;0;3500;0;2000;"Main facility; ""north wing"""\r\n',
    );
  });

  it("provides a default row with current year and blank values", () => {
    const defaultRow = createEnergyFormRow();
    expect(defaultRow.agreementId).toBe("");
    expect(defaultRow.locationCode).toBe("");
    expect(defaultRow.address).toBe("");
    expect(defaultRow.reportingYear).toBe(new Date().getFullYear());
    expect(defaultRow.reportingQuarter).toBe(Math.floor(new Date().getMonth() / 3) + 1);
    expect(defaultRow.gooCoveredKwh).toBe("");
    expect(defaultRow.electricityKwh).toBe("");
    expect(defaultRow.districtHeatingKwh).toBe("");
  });
});
