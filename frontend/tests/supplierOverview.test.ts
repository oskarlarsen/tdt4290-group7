import { describe, it, expect } from "vitest";
import { buildSupplierOverview } from "../src/utils/supplierOverview";
import type { TopRiskSupplier, RecentAlert } from "../src/types/dashboard";
import type { DerivedContract } from "../src/types/contract";
import type { Certificate } from "../src/types/certificate";
import { energyContract } from "./support/energyFixtures";

describe("buildSupplierOverview", () => {
  const mockSuppliers: TopRiskSupplier[] = [
    { id: "sup-x", displayName: "Supplier X", orgId: "123", primaryContract: "C1", risk: "compliant", mainIssue: "" },
    { id: "sup-y", displayName: "Supplier Y", orgId: "456", primaryContract: "C2", risk: "high", mainIssue: "" }
  ];

  const mockContracts: DerivedContract[] = [
    { id: "sup-x", supplierId: "sup-x", contractName: "C1", supplierName: "X", supplierOrgId: "123", risk: "compliant", mainIssue: "", status: "Active", startDate: "2026-01-01", endDate: "2026-12-31", documentUrl: null },
    { id: "sup-y", supplierId: "sup-y", contractName: "C2", supplierName: "Y", supplierOrgId: "456", risk: "high", mainIssue: "", status: "Active", startDate: "2026-01-01", endDate: "2026-12-31", documentUrl: null }
  ];

  const mockCerts: Certificate[] = [
    { id: "cert-x1", contractId: "sup-x", standard: "iso14001", certificateNumber: "1", validUntil: "2030-01-01" },
    { id: "cert-y1", contractId: "sup-y", standard: "iso14001", certificateNumber: null, validUntil: null }
  ];

  // sup-y has a commitment of 1000 kWh and delivered 400, so it is below its commitment.
  const mockEnergy = [energyContract({ agreementId: "sup-y", status: "NON_COMPLIANT", selfProducedKwh: 400, selfProducedDeviationKwh: -600 })];

  const mockAlerts: RecentAlert[] = [
    { id: "a1", supplierId: "sup-x", severity: "high", title: "Test", description: "Test", timeAgo: "1h", status: "OPEN" },
    { id: "a2", supplierId: "sup-y", severity: "medium", title: "Test", description: "Test", timeAgo: "1h", status: "OPEN" }
  ];

  it("strictly scopes data to the requested supplier", () => {
    const result = buildSupplierOverview(
      "sup-x",
      mockSuppliers,
      mockContracts,
      mockCerts,
      { suppliers: [], agreements: [], vehicles: [], changes: [] },
      mockEnergy,
      mockAlerts
    );

    expect(result.supplier?.name).toBe("Supplier X");
    expect(result.contract?.id).toBe("sup-x");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].supplierId).toBe("sup-x");
    expect(result.summaries.certificates.valid).toBe(1);
    expect(result.summaries.certificates.missing).toBe(0);
    // Energy state should be not-applicable because sup-x has no energy summary
    expect(result.summaries.energy.state).toBe("not-applicable");
  });

  it("derives correct actions and handles edge states", () => {
    const result = buildSupplierOverview(
      "sup-y",
      mockSuppliers,
      mockContracts,
      mockCerts,
      { suppliers: [], agreements: [], vehicles: [], changes: [] },
      mockEnergy,
      mockAlerts
    );

    expect(result.summaries.certificates.missing).toBe(1);
    // sup-y delivered 400 of its 1000 kWh commitment
    expect(result.summaries.energy.isBreach).toBe(true);

    const actionTitles = result.requiredActions.map(a => a.title);
    expect(actionTitles).toContain("Last opp sertifikatdokumentasjon");
    expect(actionTitles).toContain("Send inn kjøretøydata"); // because total: 0 -> data-missing
    expect(actionTitles).toContain("Gå gjennom energidata"); // commitment not met
  });

  it("returns null for non-existent supplier", () => {
     const result = buildSupplierOverview("sup-z", [], [], [], null, [], []);
     expect(result.supplier).toBeNull();
  });
});