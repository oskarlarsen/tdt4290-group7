import { describe, it, expect } from "vitest";
import { buildSupplierOverview } from "../../src/utils/supplierOverview";
import type { TopRiskSupplier, RecentAlert } from "../../src/types/dashboard";
import type { DerivedContract } from "../../src/types/contract";
import type { Certificate } from "../../src/types/certificate";
import type { EnergyRequirement, EnergyRecord } from "../../src/types/energy";

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

  const mockEnergyReqs: EnergyRequirement[] = [{ contractId: "sup-y", minRenewableSharePercent: 80 }];
  const mockEnergyRecs: EnergyRecord[] = [{ id: "e1", contractId: "sup-y", period: "2026", consumptionKwh: { electric: 100, biogas: 0, fossil: 100 } }];

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
      { items: [], total: 0 },
      { requirements: mockEnergyReqs, records: mockEnergyRecs },
      mockAlerts
    );

    expect(result.supplier?.name).toBe("Supplier X");
    expect(result.contract?.id).toBe("sup-x");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].supplierId).toBe("sup-x");
    expect(result.summaries.certificates.valid).toBe(1);
    expect(result.summaries.certificates.missing).toBe(0);
    // Energy state should be not-applicable because sup-x has no energy reqs
    expect(result.summaries.energy.state).toBe("not-applicable");
  });

  it("derives correct actions and handles edge states", () => {
    const result = buildSupplierOverview(
      "sup-y",
      mockSuppliers,
      mockContracts,
      mockCerts,
      { items: [], total: 0 },
      { requirements: mockEnergyReqs, records: mockEnergyRecs },
      mockAlerts
    );

    expect(result.summaries.certificates.missing).toBe(1);
    // sup-y energy requires 80% renewable, has 50% (100/200), so it's a breach
    expect(result.summaries.energy.isBreach).toBe(true);

    const actionTitles = result.requiredActions.map(a => a.title);
    expect(actionTitles).toContain("Upload certificate documentation");
    expect(actionTitles).toContain("Submit vehicle data"); // because total: 0 -> data-missing
    expect(actionTitles).toContain("Review energy data"); // breach
  });

  it("returns null for non-existent supplier", () => {
     const result = buildSupplierOverview("sup-z", [], [], [], null, { requirements: [], records: [] }, []);
     expect(result.supplier).toBeNull();
  });
});