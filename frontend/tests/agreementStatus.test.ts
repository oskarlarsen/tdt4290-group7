import { describe, expect, it } from "vitest";
import { agreementStatusText, getAgreementStatus } from "../src/utils/agreementStatus";
import { formatDate } from "../src/utils/formatDate";
import type { FleetAgreement } from "../src/types/vehicle";

const agreement: FleetAgreement = {
  id: "agreement-1",
  supplierId: "supplier-1",
  startDate: "2026-01-01",
  endDate: "2027-01-01",
  allowedVehicles: 4,
  note: "",
  saksnr: "2024/1234",
  updatedAt: "2026-01-01T00:00:00Z",
  active: true,
  requiresVehicles: true,
  requiresEnergy: false,
  requiresProducts: false,
};

describe("getAgreementStatus", () => {
  const today = new Date(2026, 9, 1);

  it("distinguishes upcoming, active, expiring, and past-end agreements", () => {
    expect(getAgreementStatus({ ...agreement, startDate: "2026-10-02" }, today)).toBe("Upcoming");
    expect(getAgreementStatus(agreement, today)).toBe("Active");
    expect(getAgreementStatus({ ...agreement, endDate: "2026-11-15" }, today)).toBe("Expiring soon");
    expect(getAgreementStatus({ ...agreement, endDate: "2026-09-30" }, today)).toBe("Expired");
  });

  it("marks an inactive agreement as expired even if its dates are current", () => {
    expect(getAgreementStatus({ ...agreement, active: false }, today)).toBe("Expired");
  });
});

describe("agreementStatusText", () => {
  const today = new Date(2026, 9, 1);

  it("gives the date that explains each status", () => {
    expect(agreementStatusText({ ...agreement, startDate: "2026-10-02" }, today)).toBe(`Starts on ${formatDate("2026-10-02")}`);
    expect(agreementStatusText(agreement, today)).toBe(`Expires on ${formatDate("2027-01-01")}`);
    expect(agreementStatusText({ ...agreement, endDate: "2026-11-15" }, today)).toBe(`Expires on ${formatDate("2026-11-15")}`);
    expect(agreementStatusText({ ...agreement, endDate: "2026-09-30" }, today)).toBe(`Expired on ${formatDate("2026-09-30")}`);
  });

  it("reads an end date of today as expiring, not expired", () => {
    expect(agreementStatusText({ ...agreement, endDate: "2026-10-01" }, today)).toBe(`Expires on ${formatDate("2026-10-01")}`);
  });

  it("does not claim a date for an inactive agreement", () => {
    expect(agreementStatusText({ ...agreement, active: false }, today)).toBe("Removed");
  });
});
