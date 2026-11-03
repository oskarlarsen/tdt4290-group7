import { describe, expect, it } from "vitest";
import { buildRiskOutlook } from "../src/types/riskOutlook";
import type { DerivedContract } from "../src/types/contract";
import type { Certificate } from "../src/types/certificate";

describe("certificate risk linkage", () => {
  it("adds an expired uploaded certificate to the selected contract's risk indicators", () => {
    const contract: DerivedContract = {
      id: "sup-a",
      contractName: "Example transport contract",
      supplierId: "sup-a",
      supplierName: "Example Transport AS",
      supplierOrgId: "NO 123 456 789 MVA",
      risk: "compliant",
      mainIssue: "",
      status: "Active",
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      documentUrl: null,
    };
    const certificate: Certificate = {
      id: "uploaded-certificate",
      standard: "iso-14001",
      certificateNumber: null,
      contractId: "sup-a",
      validUntil: "2026-10-20",
      supplierName: "Example Transport AS",
    };

    const [row] = buildRiskOutlook(
      { contracts: [contract], certificates: [certificate], energy: { requirements: [], records: [] } },
      new Date("2026-10-30T12:00:00Z"),
    );

    expect(row.priority).toBe("medium");
    expect(row.indicators).toContainEqual(
      expect.objectContaining({
        category: "certificate",
        kind: "active",
        title: "ISO 14001 expired",
      }),
    );
  });
});
