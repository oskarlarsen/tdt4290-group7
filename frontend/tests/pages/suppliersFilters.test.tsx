// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const supplier = (id: string, risk: string, issueCategories: string[] = []) => ({
  id, displayName: `Supplier ${id}`, orgId: id, primaryContract: "2024/1 — x", risk, mainIssue: "m", issueCategories,
  onboardingStatus: "INVITED", agreementCount: 0, vehicleCount: 0, certificateCount: 0, energyRecordCount: 0, productCount: 0, registeredAccountCount: 0,
});
const summary = {
  topRiskSuppliers: [supplier("hi", "high", ["VEHICLE_DEVIATION", "CERTIFICATE_EXPIRY"]), supplier("med", "medium", ["VEHICLE_DEVIATION"]), supplier("ok", "compliant"), supplier("none", "unassessed")],
  riskClassification: { high: { count: 1, percent: 25 }, medium: { count: 1, percent: 25 }, low: { count: 0, percent: 0 }, compliant: { count: 1, percent: 25 }, unassessed: { count: 1, percent: 25 } },
  kpis: {}, recentAlerts: [],
};

vi.mock("../../src/hooks/useDashboardSummary", () => ({ useDashboardSummary: () => ({ data: summary, isLoading: false, isError: false }) }));
vi.mock("../../src/hooks/useVehicles", () => ({
  useFleet: () => ({ data: { suppliers: [], agreements: [], vehicles: [], changes: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useArchive: () => ({ data: { suppliers: [] }, isError: false }),
  useRefreshVehicles: () => vi.fn(),
}));
vi.mock("../../src/hooks/useSupplierReviewStatus", () => ({
  useSupplierReviewStatus: () => ({ getStatus: () => "to-review", setStatus: vi.fn(), errorMessage: null }),
}));

vi.mock("../../src/hooks/useAlerts", () => ({ useAlerts: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "a", name: "Admin", role: "ADMIN" } }) }));

import Suppliers from "../../src/pages/admin/Suppliers";

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; }
function mount(url: string) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Suppliers /><Where /></MemoryRouter></QueryClientProvider>);
}
afterEach(cleanup);

describe("admin suppliers page risk filter", () => {
  it("shows only high-risk suppliers for ?risk=high", () => {
    mount("/admin/suppliers?risk=high");
    expect(screen.getAllByText("Supplier hi").length).toBeGreaterThan(0);
    expect(screen.queryByText("Supplier med")).toBeNull();
    expect(screen.queryByText("Supplier ok")).toBeNull();
    expect((screen.getByLabelText("Filtrer leverandører etter risikonivå") as HTMLSelectElement).value).toBe("high");
  });

  it("treats an unknown risk value as All", () => {
    mount("/admin/suppliers?risk=bogus");
    expect(screen.getAllByText("Supplier hi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Supplier med").length).toBeGreaterThan(0);
  });

  it("filters the list when a risk card is pressed and clears it when pressed again", () => {
    mount("/admin/suppliers");
    const card = screen.getByRole("button", { name: /HØY RISIKO/ });
    fireEvent.click(card);
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers?risk=high");
    expect(card.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(card);
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers");
  });

  it("keeps the URL in step with the filter", () => {
    mount("/admin/suppliers?risk=high");
    const select = screen.getByLabelText("Filtrer leverandører etter risikonivå");
    fireEvent.change(select, { target: { value: "unassessed" } });
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers?risk=unassessed");
    fireEvent.change(select, { target: { value: "all" } });
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers");
  });
});

describe("admin suppliers page issue filter", () => {
  it("keeps a supplier with both kinds of problem under each category", () => {
    mount("/admin/suppliers?issue=certificate");
    expect(screen.getAllByText("Supplier hi").length).toBeGreaterThan(0);
    expect(screen.queryByText("Supplier med")).toBeNull();
    expect(screen.queryByText("Supplier ok")).toBeNull();
  });

  it("lists every supplier with a vehicle deviation for ?issue=vehicle", () => {
    mount("/admin/suppliers?issue=vehicle");
    expect(screen.getAllByText("Supplier hi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Supplier med").length).toBeGreaterThan(0);
    expect(screen.queryByText("Supplier ok")).toBeNull();
  });

  it("combines with the risk filter and keeps the URL in step", () => {
    mount("/admin/suppliers?issue=vehicle&risk=medium");
    expect(screen.queryByText("Supplier hi")).toBeNull();
    expect(screen.getAllByText("Supplier med").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Filtrer leverandører etter problemkategori"), { target: { value: "all" } });
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers?risk=medium");
  });
});

describe("supplier summary and details windows", () => {
  it("replaces the side panel with the Details window and brings it back on close", () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    mount("/admin/suppliers?supplierId=hi");

    fireEvent.click(screen.getByRole("button", { name: "Detaljer" }));
    expect(screen.getByRole("dialog", { name: "Detaljer for Supplier hi" })).toBeTruthy();
    // The side panel is gone while the large window is open, so Escape cannot close both.
    expect(screen.queryByRole("button", { name: "Detaljer" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lukk Detaljer for Supplier hi" }));
    expect(screen.queryByRole("dialog", { name: "Detaljer for Supplier hi" })).toBeNull();
    expect(screen.getByRole("button", { name: "Detaljer" })).toBeTruthy();
  });
});
