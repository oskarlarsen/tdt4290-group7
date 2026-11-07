import { describe, expect, it } from "vitest";
import { dashboardTotals } from "../src/utils/dashboardTotals";

describe("dashboard totals", () => {
  it("counts listed vehicles and certificates by what is stored", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const totals = dashboardTotals(
      [{ listed: true }, { listed: true }, { listed: false }],
      [
        { validUntil: "2026-10-01", standard: "ISO_14001" },
        { validUntil: "2026-12-29", standard: "ISO_14001" },
        { validUntil: "2028-01-01", standard: "ISO_14001" },
        { validUntil: null, standard: "ISO_14001" },
      ],
      now,
    );
    expect(totals).toEqual({ listedVehicles: 2, certificatesTracked: 4, expiredCertificates: 1, certificatesExpiringWithin90Days: 1 });
  });
});
