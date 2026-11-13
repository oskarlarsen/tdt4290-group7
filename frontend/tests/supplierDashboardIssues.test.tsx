// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const alerts = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("../src/hooks/useSupplierAlerts", () => ({
  useSupplierAlerts: () => ({ data: alerts.data, isLoading: false, isError: false }),
}));
vi.mock("../src/api/onboarding", () => ({
  getOnboardingStatus: () => Promise.resolve({ status: "APPROVED" }),
  getSupplierOverview: () =>
    Promise.resolve({
      supplierName: "Nordvik AS", orgNumber: "999", agreements: [], totalVehicles: 0,
      totalCertificates: 0, totalEnergyRecords: 0, totalProducts: 0,
    }),
}));

import Dashboard from "../src/pages/supplier/Dashboard";

afterEach(cleanup);

describe("supplier dashboard issue tiles", () => {
  it("counts open alerts per category and links each tile to the filtered feed", async () => {
    alerts.data = [
      { id: "1", category: "CERTIFICATES", status: "OPEN" },
      { id: "2", category: "CERTIFICATES", status: "OPEN" },
      { id: "3", category: "CERTIFICATES", status: "RESOLVED" },
      { id: "4", category: "ENERGY_FUEL", status: "OPEN" },
    ];
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    const issues = await waitFor(() => within(screen.getByRole("region", { name: "Åpne saker" })));
    const certificates = issues.getByRole("link", { name: /Sertifikater/ });
    expect(certificates.textContent).toContain("2");
    expect(certificates.getAttribute("href")).toBe("/supplier/alerts?category=CERTIFICATES");
    expect(issues.getByRole("link", { name: /Energi/ }).textContent).toContain("1");
    expect(issues.getByRole("link", { name: /Kjøretøyoppfølging/ }).textContent).toContain("0");
  });
});
