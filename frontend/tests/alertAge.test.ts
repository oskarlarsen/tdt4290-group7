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
    expect(formatAlertAge(new Date(2026, 10, 2, 8).toISOString(), now)).toBe("I dag");
    expect(formatAlertAge(new Date(2026, 10, 1, 23).toISOString(), now)).toBe("for 1 dag siden");
    expect(formatAlertAge(new Date(2026, 9, 30, 12).toISOString(), now)).toBe("for 3 dager siden");
    expect(formatAlertAge(new Date(2026, 9, 26, 12).toISOString(), now)).toBe("for 1 uke siden");
    expect(formatAlertAge(new Date(2026, 9, 19, 12).toISOString(), now)).toBe("for 14 dager siden");
  });

  it("formats creation dates as day, short month, year", () => {
    expect(formatAlertCreatedDate(new Date(2026, 0, 5, 12).toISOString())).toBe("5. jan. 2026");
  });

  it("does not substitute another value when the creation date is missing or invalid", () => {
    expect(formatAlertCreatedDate()).toBe("Ikke tilgjengelig");
    expect(formatAlertAge()).toBe("Ikke tilgjengelig");
    expect(formatAlertAge("not-a-date", now)).toBe("Ikke tilgjengelig");
  });

  it("provides fictional creation dates for all mock alerts to drive the Created On column", () => {
    const creationDates = getAllAlerts().map((mockAlert) => {
      expect(mockAlert.createdAt).toBeDefined();
      return formatAlertCreatedDate(mockAlert.createdAt);
    });

    expect(creationDates).not.toContain("Ikke tilgjengelig");
    creationDates.forEach((creationDate) => {
      expect(creationDate).toMatch(/^\d{1,2}\. [a-zæøå]{3,4}\.? \d{4}$/);
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
    expect(headers).toEqual(["Beskrivelse", "Leverandør", "Avtale", "Risiko", "Status", "Opprettet", "Handling"]);
    expect(html).toMatch(/<th scope="col" class="whitespace-nowrap pb-2 pr-3 font-medium">Opprettet<\/th>/);
    expect(html).not.toContain("Risk / Priority");
    expect(html).toContain(">Lav</span>");
    expect(html).toContain("Varseltype:");
    expect(html).toContain("Bekreftet avvik");
    expect(html).toContain("aria-label=\"Vis detaljer for Test alert\"");
    expect(html.indexOf(">Handling</th>")).toBeLessThan(html.indexOf("aria-label=\"Vis detaljer for Test alert\""));
    expect(html.indexOf("aria-label=\"Vis detaljer for Test alert\""))
      .toBeLessThan(html.indexOf("aria-label=\"Arkiver Test alert\""));
    expect(html).toContain(">Lav</span>");
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
    expect(html).toContain(">Risiko</span>");
    expect(html).toContain("Varseltype:");
    expect(html).toContain("Kommende utløp");
    expect(html).toContain("Opprettet");
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
      affectedItem: { type: "Document", name: "Miljøfyrtårn-sertifikat" },
    });
    expect(missingDocumentation?.description).toContain("er ikke sendt inn");
    expect(confirmedDeviation).toBeDefined();
    expect(upcomingExpiry).toMatchObject({
      severity: "medium",
      affectedItem: { type: "Document", name: "Sertifikat for kurs i økonomisk kjøring (DEMO-CERT-004)" },
    });
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("avregistrert"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("godkjente kjøretøylisten"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("bruksforbud"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("fossilt brensel"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("energiforpliktelse"))).toBe(true);
    expect(mockAlerts.some((mockAlert) => mockAlert.title.includes("Miljøsertifikat er utløpt"))).toBe(true);
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
    expect(html).toContain("Varseltype:");
    expect(html).toContain("Dokumentasjon mangler");
    expect(html).toContain("Manglende dokumentasjon alene");
    expect(html).toContain("Leverandør C");
    expect(html).toContain("Skolebygg Rehabilitering");
    expect(html).toContain("Miljøfyrtårn-sertifikat");
    expect(html).toContain("Den eksisterende sertifikatoppføringen har verken innsendt utløpsdato eller sertifikatnummer.");
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
    expect(html).toContain("Ikke tilgjengelig");
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
    expect(html).toContain(">Åpen</span>");
    expect(html).toContain(">Under arbeid</span>");
    expect(html).toContain(">Under vurdering</span>");
    expect(html).toContain(">Løst</span>");
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
