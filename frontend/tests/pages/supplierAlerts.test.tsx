// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupplierAlert } from "../../src/api/supplierAlerts";

const getSupplierAlerts = vi.hoisted(() => vi.fn());
const getSupplierNotes = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("../../src/api/supplierAlerts", () => ({ getSupplierAlerts, getSupplierNotes }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", name: "Supplier", role: "SUPPLIER", supplierId: "s1" } }) }));

import MyAlerts from "../../src/pages/supplier/MyAlerts";

const alert = (id: string, extra: Partial<SupplierAlert> = {}): SupplierAlert => ({
  id, title: `Alert ${id}`, description: `Fix ${id}`, severity: "high", category: "VEHICLE_COMPLIANCE", dueDate: null,
  status: "OPEN", createdAt: "2026-10-01T10:00:00Z", ...extra,
});

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; }
function mount(url = "/supplier/alerts") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}><MyAlerts /><Where /></MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("supplier My Alerts", () => {
  it("lists the supplier's alerts with severity, status and due date", async () => {
    getSupplierAlerts.mockResolvedValue([alert("a1", { dueDate: "2026-12-01" }), alert("a2", { status: "RESOLVED", severity: "low" })]);
    mount();
    expect(await screen.findByText("Alert a1")).toBeTruthy();
    expect(screen.getByText("Fix a1")).toBeTruthy();
    expect(screen.getByText("Løst")).toBeTruthy();
    expect(screen.getByText(/Frist/)).toBeTruthy();
    expect(getSupplierAlerts).toHaveBeenCalledWith(undefined);
  });

  it("asks the server for the category in the URL and keeps the URL in step with the filter", async () => {
    getSupplierAlerts.mockResolvedValue([alert("v1")]);
    mount("/supplier/alerts?category=VEHICLE_COMPLIANCE");
    await waitFor(() => expect(getSupplierAlerts).toHaveBeenCalledWith("VEHICLE_COMPLIANCE"));
    expect((screen.getByLabelText("Filtrer varsler etter kategori") as HTMLSelectElement).value).toBe("VEHICLE_COMPLIANCE");
    fireEvent.change(screen.getByLabelText("Filtrer varsler etter kategori"), { target: { value: "CERTIFICATES" } });
    expect(screen.getByTestId("where").textContent).toBe("/supplier/alerts?category=CERTIFICATES");
    fireEvent.change(screen.getByLabelText("Filtrer varsler etter kategori"), { target: { value: "" } });
    expect(screen.getByTestId("where").textContent).toBe("/supplier/alerts");
  });

  it("says so when there are no alerts, and shows the error when loading fails", async () => {
    getSupplierAlerts.mockResolvedValueOnce([]);
    mount("/supplier/alerts?category=CERTIFICATES");
    expect(await screen.findByText("Ingen varsler i denne kategorien.")).toBeTruthy();
    cleanup();
    getSupplierAlerts.mockRejectedValueOnce(new Error("Supplier access required"));
    mount();
    expect(await screen.findByText("Supplier access required")).toBeTruthy();
  });
});
