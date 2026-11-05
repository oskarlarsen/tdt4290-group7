import { describe, expect, it } from "vitest";
import { vehicleRowsToCsv, type VehicleFormRow } from "../src/utils/vehicleFormCsv";

const row: VehicleFormRow = {
  id: "vehicle-1",
  agreementId: "agreement-1",
  registrationNumber: "AB12345",
  isPlanned: false,
  fuelTechnology: "13",
  isHybrid: true,
  fullContractCoverage: false,
  startYearWeek: "2026-W08",
  endYearWeek: "2026-W52",
  attachmentReference: "DOC-001",
  notes: 'Includes; "quoted" note',
};

describe("vehicle form CSV adapter", () => {
  it("maps yes/no answers to the CSV booleans and safely quotes text", () => {
    expect(vehicleRowsToCsv([row])).toBe(
      "agreement_id;registration_number;is_planned;fuel_technology;is_hybrid;full_contract_coverage;start_year_week;end_year_week;attachment_reference;notes\r\n" +
      'agreement-1;AB12345;FALSE;13;TRUE;FALSE;2026-W08;2026-W52;DOC-001;"Includes; ""quoted"" note"\r\n',
    );
  });

  it("leaves a planned vehicle's registration plate empty", () => {
    expect(vehicleRowsToCsv([{ ...row, registrationNumber: "", isPlanned: true }]).split("\r\n")[1])
      .toBe('agreement-1;;TRUE;13;TRUE;FALSE;2026-W08;2026-W52;DOC-001;"Includes; ""quoted"" note"');
  });
});
