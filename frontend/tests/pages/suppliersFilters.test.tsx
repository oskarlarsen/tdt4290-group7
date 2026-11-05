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
  riskClassification: { high: { count: 1, percent: 25 }, medium: { count: 1, percent: 25 }, compliant: { count: 1, percent: 25 }, unassessed: { count: 1, percent: 25 } },
  kpis: {}, recentAlerts: [],
};

vi.mock("../../src/hooks/useDashboardSummary", () => ({ useDashboardSummary: () => ({ data: summary, isLoading: false, isError: false }) }));
vi.mock("../../src/hooks/useVehicles", () => ({
  useFleet: () => ({ data: { suppliers: [], agreements: [], vehicles: [], changes: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useRefreshVehicles: () => vi.fn(),
}));
vi.mock("../../src/hooks/useSupplierReviewStatus", () => ({
  useSupplierReviewStatus: () => ({ getStatus: () => "to-review", setStatus: vi.fn(), errorMessage: null }),
}));

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
    expect((screen.getByLabelText("Filter suppliers by risk level") as HTMLSelectElement).value).toBe("high");
  });

  it("treats an unknown risk value as All", () => {
    mount("/admin/suppliers?risk=bogus");
    expect(screen.getAllByText("Supplier hi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Supplier med").length).toBeGreaterThan(0);
  });

  it("keeps the URL in step with the filter", () => {
    mount("/admin/suppliers?risk=high");
    const select = screen.getByLabelText("Filter suppliers by risk level");
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
    fireEvent.change(screen.getByLabelText("Filter suppliers by issue category"), { target: { value: "all" } });
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers?risk=medium");
  });
});
