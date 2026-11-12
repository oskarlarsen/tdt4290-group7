import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  CreateManualAlertDialog,
  parseEuropeanDueDate,
} from "../src/components/alerts/CreateManualAlertDialog";
import { addManualAlert, deleteAlert, getAllAlerts, getAlertsBySeverity, getTopRiskSuppliers } from "../src/mocks/db";
import { ALERT_CATEGORIES } from "../src/types/dashboard";
import type { AlertSeverity } from "../src/types/dashboard";
import { startAlertDeleteCountdown } from "../src/pages/admin/Alerts";

afterEach(() => {
  vi.useRealTimers();
});

describe("manual alert creation", () => {
  it("renders required form fields, supported categories, severities, and actions", () => {
    const html = renderToStaticMarkup(
      createElement(CreateManualAlertDialog, {
        open: true,
        suppliers: getTopRiskSuppliers(),
        onClose: () => {},
        onCreate: async () => {},
      })
    );

    expect(html).toContain("Opprett manuelt varsel");
    expect(html).toContain("Tittel på varsel *");
    expect(html).toContain("Leverandør *");
    expect(html).toContain("Risikokategori *");
    expect(html).toContain("Risiko *");
    expect(html).toContain("Varseltype *");
    expect(html).toContain("Beskrivelse *");
    expect(html).toContain("Frist");
    expect(html).toContain("DD.MM.ÅÅÅÅ");
    expect(html).toContain('type="date"');
    expect(html).toContain("Avbryt");
    expect(html).toContain("Opprett varsel");
    for (const category of [
      "Miljøoppfølging",
      "Energi",
      "Kjøretøyoppfølging",
      "Sertifikater",
    ]) {
      expect(html).toContain(category);
    }
    expect(ALERT_CATEGORIES).not.toContain("OTHER");
    for (const type of ["Bekreftet avvik", "Dokumentasjon mangler", "Kommende utløp"]) {
      expect(html).toContain(type);
    }
  });

  it("interprets entered due dates as DD/MM/YYYY and preserves ISO values", () => {
    expect(parseEuropeanDueDate("05/11/2026")).toBe("2026-11-05");
    expect(parseEuropeanDueDate("29/02/2028")).toBe("2028-02-29");
    expect(parseEuropeanDueDate("29/02/2027")).toBeUndefined();
    expect(parseEuropeanDueDate("31/04/2026")).toBeUndefined();
    expect(parseEuropeanDueDate("11/05/2026")).toBe("2026-05-11");
    expect(parseEuropeanDueDate("2026-11-05")).toBeUndefined();
    expect(parseEuropeanDueDate("05.11.2026")).toBe("2026-11-05");
  });

  it("creates a manual OPEN alert associated with a supplier and includes it in counts", () => {
    const supplier = getTopRiskSuppliers()[0];
    const beforeCount = getAllAlerts().length;
    const beforeHighCount = getAlertsBySeverity().high;
    const severity: AlertSeverity = "high";
    const created = addManualAlert({
      title: "  Follow-up needed  ",
      supplierId: supplier.id,
      category: "ENVIRONMENTAL_COMPLIANCE",
      severity,
      findingType: "MISSING_DOCUMENTATION",
      description: "  Review the submitted evidence.  ",
      dueDate: "2026-11-10",
    });

    expect(created).toMatchObject({
      title: "Follow-up needed",
      description: "Review the submitted evidence.",
      supplierId: supplier.id,
      category: "ENVIRONMENTAL_COMPLIANCE",
      severity: "high",
      findingType: "MISSING_DOCUMENTATION",
      dueDate: "2026-11-10",
      source: "MANUAL",
      status: "OPEN",
    });
    expect(created.createdAt).toBeTruthy();
    expect(getAllAlerts()).toHaveLength(beforeCount + 1);
    expect(getAllAlerts()[0].id).toBe(created.id);
    expect(getAlertsBySeverity().high).toBe(beforeHighCount + 1);
  });

  it("rejects manual alerts with missing required values or an unknown supplier", () => {
    expect(() =>
      addManualAlert({
        title: " ",
        supplierId: "unknown",
        category: "CERTIFICATES",
        severity: "low",
        findingType: "UPCOMING_EXPIRY",
        description: "Description",
      })
    ).toThrow("Tittel, type, beskrivelse og en gyldig leverandør er påkrevd for varselet.");
  });

  it("permanently removes an alert from the mock alerts store", () => {
    const created = addManualAlert({
      title: "Delete test alert",
      supplierId: getTopRiskSuppliers()[0].id,
      category: "ENVIRONMENTAL_COMPLIANCE",
      severity: "low",
      findingType: "CONFIRMED_DEVIATION",
      description: "Test deletion",
    });
    const indexBeforeDelete = getAllAlerts().findIndex((alert) => alert.id === created.id);

    deleteAlert(created.id);

    expect(getAllAlerts().some((alert) => alert.id === created.id)).toBe(false);
    expect(getAllAlerts().length).toBeGreaterThan(0);
    expect(indexBeforeDelete).toBeGreaterThanOrEqual(0);
    expect(() => deleteAlert(created.id)).toThrow(`Varselet «${created.id}» ble ikke funnet.`);
  });

  it("counts down from five seconds and confirms deletion only after the deadline", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const onExpire = vi.fn();
    const deadline = Date.now() + 5000;
    const stopCountdown = startAlertDeleteCountdown(deadline, onTick, onExpire);

    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenLastCalledWith(4);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);
    expect(onTick).toHaveBeenLastCalledWith(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
    stopCountdown();
    vi.advanceTimersByTime(1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("stops the deletion countdown when the user undoes before expiry", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const onExpire = vi.fn();
    const deadline = Date.now() + 5000;
    const stopCountdown = startAlertDeleteCountdown(deadline, onTick, onExpire);

    vi.advanceTimersByTime(2000);
    stopCountdown();
    vi.advanceTimersByTime(5000);

    expect(onExpire).not.toHaveBeenCalled();
  });
});
