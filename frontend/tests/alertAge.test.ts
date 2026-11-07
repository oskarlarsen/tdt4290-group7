import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { AlertStatusBadge } from "../src/components/alerts/AlertBadges";
import { AlertsTable } from "../src/components/alerts/AlertsTable";
import { AlertDetailsDrawer } from "../src/components/alerts/AlertDetailsDrawer";
import { formatAlertAge, formatAlertCreatedDate } from "../src/utils/alertAge";
import { getAllAlerts, getDerivedContracts, getUnresolvedAlerts, updateAlertStatus } from "../src/mocks/db";
import { ALERT_STATUSES } from "../src/types/dashboard";
import type { RecentAlert } from "../src/types/dashboard";

const alert: RecentAlert = {
  id: "alert-test",
  severity: "low",
  title: "Test alert",
  description: "Test description",
  timeAgo: "5 days ago",
  status: "OPEN",
};

describe("alert creation date and age formatting", () => {
  const now = new Date(2026, 10, 2, 12);

  it("formats alert age by calendar day with clear relative labels", () => {
    expect(formatAlertAge(new Date(2026, 10, 2, 8).toISOString(), now)).toBe("Today");
    expect(formatAlertAge(new Date(2026, 10, 1, 23).toISOString(), now)).toBe("1 day ago");
    expect(formatAlertAge(new Date(2026, 9, 30, 12).toISOString(), now)).toBe("3 days ago");
    expect(formatAlertAge(new Date(2026, 9, 26, 12).toISOString(), now)).toBe("1 week ago");
    expect(formatAlertAge(new Date(2026, 9, 19, 12).toISOString(), now)).toBe("14 days ago");
  });

  it("formats creation dates as DD/MM/YYYY", () => {
    expect(formatAlertCreatedDate(new Date(2026, 0, 5, 12).toISOString())).toBe("05/01/2026");
  });

  it("does not substitute another value when the creation date is missing or invalid", () => {
    expect(formatAlertCreatedDate()).toBe("Unavailable");
    expect(formatAlertAge()).toBe("Unavailable");
    expect(formatAlertAge("not-a-date", now)).toBe("Unavailable");
  });

  it("provides fictional creation dates for all mock alerts to drive the Created On column", () => {
    const creationDates = getAllAlerts().map((mockAlert) => {
      expect(mockAlert.createdAt).toBeDefined();
      return formatAlertCreatedDate(mockAlert.createdAt);
    });

    expect(creationDates).not.toContain("Unavailable");
    creationDates.forEach((creationDate) => {
      expect(creationDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
  });

  it("shows alert type alongside Description, Risk, and Created On in the table", () => {
    const rowAlert = {
      ...alert,
      findingType: "CONFIRMED_DEVIATION" as const,
      createdAt: new Date(2026, 10, 2, 12).toISOString(),
    };
    const html = renderToStaticMarkup(
      createElement(AlertsTable, {
        rows: [{ alert: rowAlert }],
        onSelect: () => {},
        onArchive: () => {},
        onRestore: () => {},
      })
    );
    const headers = Array.from(html.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g), ([, label]) => label);
    expect(headers).toEqual(["Description", "Supplier", "Contract", "Risk", "Status", "Created On", "Action"]);
    expect(html).toMatch(/<th class="whitespace-nowrap pb-2 pr-3 font-medium">Created On<\/th>/);
    expect(html).not.toContain("Risk / Priority");
    expect(html).toContain(">Low</span>");
    expect(html).toContain("Alert Type:");
    expect(html).toContain("Confirmed Deviation");
    expect(html).toContain("aria-label=\"View details for Test alert\"");
    expect(html.indexOf(">Action</th>")).toBeLessThan(html.indexOf("aria-label=\"View details for Test alert\""));
    expect(html.indexOf("aria-label=\"View details for Test alert\""))
      .toBeLessThan(html.indexOf("aria-label=\"Archive Test alert\""));
    expect(html).toContain(">Low</span>");
    expect(html).toContain(formatAlertCreatedDate(rowAlert.createdAt));
    expect(html).not.toContain(">Age</th>");
  });

  it("shows the creation date without an age field in alert details", () => {
    const rowAlert = {
      ...alert,
      findingType: "UPCOMING_EXPIRY" as const,
      createdAt: new Date(2026, 10, 2, 12).toISOString(),
    };
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AlertDetailsDrawer, {
          row: { alert: rowAlert },
          onClose: () => {},
          onStatusChange: () => {},
          isBusy: false,
        })
      )
    );
    expect(html).toContain(">Risk</span>");
    expect(html).toContain("Alert Type:");
    expect(html).toContain("Upcoming Expiry");
    expect(html).toContain("Created On");
    expect(html).not.toContain(">Age<");
    expect(html).toContain(formatAlertCreatedDate(rowAlert.createdAt));
  });

  it("keeps missing documentation distinct from confirmed deviations and upcoming expiry", () => {
    const mockAlerts = getAllAlerts();
    const missingDocumentation = mockAlerts.find(
      (mockAlert) => mockAlert.findingType === "MISSING_DOCUMENTATION"
    );
    const confirmedDeviation = mockAlerts.find(
      (mockAlert) => mockAlert.findingType === "CONFIRMED_DEVIATION"
    );
    const upcomingExpiry = mockAlerts.find(
      (mockAlert) => mockAlert.findingType === "UPCOMING_EXPIRY"
    );

    expect(missingDocumentation).toMatchObject({
      severity: "medium",
      affectedItem: { type: "Document", name: "Miljøfyrtårn certificate" },
    });
    expect(missingDocumentation?.description).toContain("has not been submitted");
    expect(confirmedDeviation).toBeDefined();
    expect(upcomingExpiry).toMatchObject({
      severity: "medium",
      affectedItem: { type: "Document", name: "Eco-driving course certificate (DEMO-CERT-004)" },
    });
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("deregistered"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("approved vehicle list"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("prohibited from use"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("fossil-fuel vehicle"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("energy commitment"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("certificate has expired"))).toBe(true);
    expect(mockAlerts.every((mockAlert) => mockAlert.findingType && mockAlert.reason)).toBe(true);
  });

  it("shows finding classification, supplier, contract, affected item, and reason in details", () => {
    const missingDocumentation = getAllAlerts().find(
      (mockAlert) => mockAlert.findingType === "MISSING_DOCUMENTATION"
    );
    expect(missingDocumentation).toBeDefined();
    const contract = getDerivedContracts().find(
      (candidate) => candidate.supplierId === missingDocumentation?.supplierId
    );
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AlertDetailsDrawer, {
          row: { alert: missingDocumentation!, contract },
          onClose: () => {},
          onStatusChange: () => {},
          isBusy: false,
        })
      )
    );
    expect(html).toContain("Alert Type:");
    expect(html).toContain("Missing Documentation");
    expect(html).toContain("Missing documentation alone does not confirm a contractual violation.");
    expect(html).toContain("Supplier C");
    expect(html).toContain("Skolebygg Rehabilitering");
    expect(html).toContain("Miljøfyrtårn certificate");
    expect(html).toContain("The existing certificate record has no submitted expiry date or certificate number.");
    expect(
      html.match(/<div class="py-1 text-sm"><span class="block text-left text-neutral-500">/g)
    ).toHaveLength(9);
  });

  it("does not invent a vehicle identifier when the demo record has none", () => {
    const vehicleAlert = getAllAlerts().find(
      (mockAlert) => mockAlert.affectedItem?.type === "Vehicle"
    );
    expect(vehicleAlert).toBeDefined();
    const contract = getDerivedContracts().find(
      (candidate) => candidate.supplierId === vehicleAlert?.supplierId
    );
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AlertDetailsDrawer, {
          row: { alert: vehicleAlert!, contract },
          onClose: () => {},
          onStatusChange: () => {},
          isBusy: false,
        })
      )
    );
    expect(html).toContain("Not available in demo data");
  });

  it("shows all four fictional workflow statuses in the table", () => {
    const mockAlerts = getAllAlerts();
    const statuses = new Set(mockAlerts.map((mockAlert) => mockAlert.status));
    expect(statuses).toEqual(new Set(ALERT_STATUSES));

    const html = renderToStaticMarkup(
      createElement(
        AlertsTable,
        { rows: mockAlerts.map((mockAlert) => ({ alert: mockAlert })), onSelect: () => {} }
      )
    );
    expect(html).toContain(">Open</span>");
    expect(html).toContain(">In Progress</span>");
    expect(html).toContain(">Under Review</span>");
    expect(html).toContain(">Resolved</span>");
    const statusBadgesHtml = ALERT_STATUSES.map((status) =>
      renderToStaticMarkup(createElement(AlertStatusBadge, { status }))
    ).join("");
    expect(statusBadgesHtml.match(/inline-block whitespace-nowrap/g)).toHaveLength(ALERT_STATUSES.length);
  });

  it("updates alert workflow status and keeps resolved alerts out of unresolved lists", () => {
    const alertId = "alert-demo-9";
    const previousStatus = getAllAlerts().find((mockAlert) => mockAlert.id === alertId)?.status;
    expect(previousStatus).toBe("RESOLVED");

    updateAlertStatus(alertId, "IN_PROGRESS");
    expect(getAllAlerts().find((mockAlert) => mockAlert.id === alertId)?.status).toBe("IN_PROGRESS");
    expect(getUnresolvedAlerts().some((mockAlert) => mockAlert.id === alertId)).toBe(true);

    updateAlertStatus(alertId, "RESOLVED");
    expect(getUnresolvedAlerts().some((mockAlert) => mockAlert.id === alertId)).toBe(false);
  });
});
