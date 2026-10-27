import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ApprovalPeriods } from "../src/components/vehicles/ApprovalPeriods";
import { DeviationList } from "../src/components/vehicles/VehicleCheckResult";
import { saveApproval, revokeApproval } from "../src/api/vehicles";
import { checkLabel } from "../src/utils/vehicle";
import type { StoredApproval, VehicleCheck } from "../src/types/vehicle";

const approval: StoredApproval = { id: "synthetic-first", registrationNumber: "AB12345", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", data: { registrationNumber: "AB12345", fuelTechnology: "2", vehicleCategory: "M1", startDate: "2026-01-01", expiryDate: "2027-06-30" } };
afterEach(() => vi.unstubAllGlobals());
describe("approval periods and detailed deviations", () => {
  it("shows overlapping recertifications as separate editable/revocable records", () => {
    const html = renderToStaticMarkup(<ApprovalPeriods approvals={[approval, { ...approval, id: "synthetic-second", data: { ...approval.data, startDate: "2027-01-01", expiryDate: null } }]} onEdit={() => {}} onRevoke={() => {}} />);
    expect(html).toContain("Approval periods (2)"); expect(html).toContain("Indefinite");
    expect(html).toContain("synthetic-first"); expect(html).toContain("synthetic-second");
    expect(html.match(/>Revoke this period</g)).toHaveLength(2);
  });
  it("retains revoked evidence without presenting edit/revoke actions", () => {
    const html = renderToStaticMarkup(<ApprovalPeriods approvals={[{ ...approval, revokedAt: "2026-02-01T00:00:00Z" }]} onEdit={() => {}} onRevoke={() => {}} />);
    expect(html).not.toContain("<button"); expect(html).toContain("synthetic-first");
  });
  it("updates an explicit period with an optimistic version instead of posting a recertification", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
    await saveApproval(approval.data, "Synthetic", approval);
    expect(fetch.mock.calls[0][0]).toContain("/vehicle-approvals/synthetic-first");
    expect(fetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ approval: approval.data, sourceName: "Synthetic", expectedUpdatedAt: approval.updatedAt });
    await revokeApproval(approval.id);
    expect(fetch.mock.calls[1][0]).toContain("/vehicle-approvals/synthetic-first/revoke");
  });
  it("counts individual high/moderate findings, not just distinct finding codes", () => {
    expect(checkLabel({ id: "synthetic", checkedAt: "synthetic", approvalStatus: "ACTIVE", dataSource: "LIVE", lookupOutcome: "FOUND", deviations: ["CO2_MISMATCH"], highPriorityCount: 0, moderatePriorityCount: 2 })).toBe("2 deviations (0 high, 2 moderate)");
  });
  it("explains each deviation and offers priority filtering and row inspection", () => {
    const check: VehicleCheck = { id: "synthetic", checkedAt: "2026-06-01T00:00:00Z", vehicle: { registrationNumber: "AB12345", createdAt: "synthetic" }, approvalStatus: "ACTIVE", approvals: [approval], tripRows: [], deviations: ["APPROVAL_CONFLICT", "UNABLE_TO_VERIFY"], registry: { dataSource: "UNAVAILABLE", lookupOutcome: "NOT_CONFIGURED", deviations: [], usageProhibitionState: "UNKNOWN" }, findings: [
      { code: "APPROVAL_CONFLICT", priority: "HIGH", origin: "APPROVAL", description: "Conflicting overlapping approval values.", approvalId: approval.id, relatedApprovalId: "synthetic-second" },
      { code: "UNABLE_TO_VERIFY", priority: "MODERATE", origin: "REGISTRY", description: "Unable to verify: no registry configuration." },
    ] };
    const html = renderToStaticMarkup(<DeviationList check={check} />);
    expect(html).toContain("High priority"); expect(html).toContain("Moderate priority");
    expect(html).toContain("Unable to verify: no registry configuration.");
    expect(html).toContain("Deviation priority"); expect(html).toContain("synthetic-second");
  });
});
