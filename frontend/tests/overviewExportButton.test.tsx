// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DashboardSummary } from "../src/types/dashboard";

const getAlerts = vi.fn();
vi.mock("../src/api/alerts", () => ({ getAlerts: () => getAlerts() }));
const downloadCsv = vi.fn();
vi.mock("../src/utils/csv", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/utils/csv")>()), downloadCsv: (...args: unknown[]) => downloadCsv(...args) }));

import { DashboardExportButton } from "../src/components/ui/QuickActions";

const data = {
  kpis: { totalSuppliers: 1, highRiskSuppliers: 0, activeAlerts: 0, complianceRatePercent: 0, assessedSuppliers: 0, activeAgreements: 0, listedVehicles: 0, certificatesTracked: 0 },
  riskClassification: { high: { count: 0, percent: 0 }, medium: { count: 0, percent: 0 }, low: { count: 0, percent: 0 }, compliant: { count: 0, percent: 0 }, unassessed: { count: 1, percent: 100 } },
  topRiskSuppliers: [],
} as unknown as DashboardSummary;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("overview export button", () => {
  it("fetches every alert, then downloads one semicolon sheet", async () => {
    getAlerts.mockResolvedValue([]);
    render(<DashboardExportButton data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Eksporter oversiktsrapport" }));
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^oversiktsrapport-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csv.startsWith("﻿Seksjon;Leverandør;Navn;")).toBe(true);
    expect(await screen.findByText("Lastet ned")).toBeTruthy();
  });

  it("downloads nothing and says so when the alerts cannot be fetched", async () => {
    getAlerts.mockRejectedValue(new Error("offline"));
    render(<DashboardExportButton data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Eksporter oversiktsrapport" }));
    expect(await screen.findByText("Kunne ikke forberede eksporten. Prøv igjen.")).toBeTruthy();
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("is disabled until the dashboard data has loaded", () => {
    render(<DashboardExportButton data={undefined} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
