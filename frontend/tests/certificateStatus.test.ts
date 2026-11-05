import { describe, expect, it } from "vitest";
import { getCertificateStatus } from "../src/types/certificate";

const now = new Date(2026, 9, 1);
const daysAhead = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10);

describe("getCertificateStatus one-year warning", () => {
  it("flags ISO 14001 and Miljøfyrtårn up to a year ahead", () => {
    for (const standard of ["iso-14001", "miljofyrtarn"] as const) {
      const info = getCertificateStatus({ validUntil: daysAhead(300), standard }, now);
      expect(info.status).toBe("expiring");
      expect(info.group).toBe("expiring-soon");
      expect(info.label).toBe("Renew soon (300d)");
      expect(getCertificateStatus({ validUntil: daysAhead(365), standard }, now).status).toBe("expiring");
      expect(getCertificateStatus({ validUntil: daysAhead(366), standard }, now).status).toBe("valid");
    }
  });

  it("leaves other standards, and callers that pass no standard, on the 180-day rule", () => {
    expect(getCertificateStatus({ validUntil: daysAhead(300), standard: "retura" }, now).status).toBe("valid");
    expect(getCertificateStatus({ validUntil: daysAhead(300) }, now).status).toBe("valid");
    expect(getCertificateStatus({ validUntil: daysAhead(150), standard: "retura" }, now).status).toBe("expiring");
  });

  it("keeps the closer levels as they were", () => {
    expect(getCertificateStatus({ validUntil: daysAhead(20), standard: "iso-14001" }, now).status).toBe("critical");
    expect(getCertificateStatus({ validUntil: daysAhead(-1), standard: "iso-14001" }, now).status).toBe("expired");
  });
});
