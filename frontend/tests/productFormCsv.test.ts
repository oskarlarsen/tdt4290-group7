import { describe, expect, it } from "vitest";
import {
  createProductFormRow,
  productRowsToCsv,
  type ProductFormRow,
} from "../src/utils/productFormCsv";

const row: ProductFormRow = {
  id: "product-1",
  agreementId: "agreement-1",
  productCode: "FURN-CHAIR-01",
  productName: "Ergonomic Office Chair",
  productCategory: "FURNITURE",
  ecolabelStandard: "NORDIC_SWAN",
  licenseNumber: "5031-0024",
  unitOfMeasure: "PCS",
  isRepairedOrReused: false,
  notes: 'High durability; "steel frame"',
};

describe("product form CSV adapter", () => {
  it("converts product form row into formatted CSV with expected headers and delimiter", () => {
    const csv = productRowsToCsv([row]);
    expect(csv).toBe(
      "agreement_id;product_code;product_name;product_category;ecolabel_standard;license_number;unit_of_measure;is_repaired_or_reused;notes\r\n" +
      'agreement-1;FURN-CHAIR-01;Ergonomic Office Chair;FURNITURE;NORDIC_SWAN;5031-0024;PCS;FALSE;"High durability; ""steel frame"""\r\n',
    );
  });

  it("handles reused/circular boolean flag serialization", () => {
    const reused = productRowsToCsv([{ ...row, isRepairedOrReused: true }]);
    expect(reused.split("\r\n")[1].includes(";TRUE;")).toBe(true);
  });

  it("provides a default row with sensible defaults", () => {
    const defaultRow = createProductFormRow();
    expect(defaultRow.agreementId).toBe("");
    expect(defaultRow.productCode).toBe("");
    expect(defaultRow.productName).toBe("");
    expect(defaultRow.ecolabelStandard).toBe("NONE");
    expect(defaultRow.unitOfMeasure).toBe("PCS");
    expect(defaultRow.isRepairedOrReused).toBe(false);
  });
});
