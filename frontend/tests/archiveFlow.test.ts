import { describe, expect, it } from "vitest";
import { addManualAlert, archiveAlert, getAllAlerts, getUnresolvedAlerts, restoreAlert } from "../src/mocks/db";

describe("mock alert archive", () => {
  it("hides an archived alert unless asked for, and restore brings it back", () => {
    const created = addManualAlert({
      title: "Archive me", supplierId: "sup-a", category: "VEHICLE_COMPLIANCE", severity: "medium",
      findingType: "CONFIRMED_DEVIATION", description: "d",
    });
    archiveAlert(created.id);
    expect(getAllAlerts().some((alert) => alert.id === created.id)).toBe(false);
    expect(getAllAlerts(true).find((alert) => alert.id === created.id)?.archivedAt).toBeTruthy();
    expect(getUnresolvedAlerts().some((alert) => alert.id === created.id)).toBe(false);
    restoreAlert(created.id);
    expect(getAllAlerts().some((alert) => alert.id === created.id)).toBe(true);
    expect(() => restoreAlert(created.id)).toThrow();
  });
});
