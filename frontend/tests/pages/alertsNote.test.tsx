// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RecentAlert } from "../../src/types/dashboard";

const created: RecentAlert = {
  id: "new-alert", severity: "medium", title: "Follow up", description: "d", timeAgo: "now", createdAt: "2026-10-01T10:00:00Z",
  status: "OPEN", category: "VEHICLE_COMPLIANCE", source: "MANUAL", findingType: "CONFIRMED_DEVIATION", supplierId: "supplier-1",
};

vi.mock("../../src/hooks/useAlerts", () => ({ useAlerts: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock("../../src/hooks/useVehicles", () => ({ useFleet: () => ({ data: undefined, isLoading: false, isError: true }) }));
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-1", name: "Admin", role: "ADMIN" } }) }));
vi.mock("../../src/hooks/useDashboardSummary", () => ({
  useDashboardSummary: () => ({ data: { kpis: { activeAlerts: 0 }, topRiskSuppliers: [{ id: "supplier-1", displayName: "Nordvik AS", orgId: "1", primaryContract: "x", risk: "medium", mainIssue: "m" }] } }),
  useUpdateAlertStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../src/api/alerts", () => ({ createManualAlert: vi.fn(async () => created), deleteAlert: vi.fn() }));
vi.mock("../../src/api/notes", () => ({ addSupplierNote: vi.fn() }));

import Alerts from "../../src/pages/admin/Alerts";
import * as notesApi from "../../src/api/notes";

afterEach(cleanup);

function createAlertWithNote() {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><Alerts /></MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Create/ }));
  fireEvent.change(screen.getByLabelText(/Alert Title/), { target: { value: "Follow up" } });
  fireEvent.change(screen.getByLabelText(/^Supplier/), { target: { value: "supplier-1" } });
  fireEvent.change(screen.getByLabelText(/^Risk Category/), { target: { value: "VEHICLE_COMPLIANCE" } });
  fireEvent.change(screen.getByLabelText(/^Risk \*/), { target: { value: "medium" } });
  fireEvent.change(screen.getByLabelText(/^Alert Type/), { target: { value: "CONFIRMED_DEVIATION" } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "Check the vehicles" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Save a note to self" }));
  fireEvent.change(screen.getByLabelText(/^Note to self/), { target: { value: "Call Monday" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Alert" }));
}

describe("creating a manual alert with a note to self", () => {
  it("saves a SELF note linked to the new alert", async () => {
    vi.mocked(notesApi.addSupplierNote).mockResolvedValue({} as never);
    createAlertWithNote();
    expect(await screen.findByText("Manual alert created successfully")).toBeTruthy();
    expect(notesApi.addSupplierNote).toHaveBeenCalledWith(
      "supplier-1", { id: "admin-1", name: "Admin" }, { text: "Call Monday", visibility: "SELF", alertId: "new-alert" },
    );
  });

  it("keeps the alert and says so when only the note fails", async () => {
    vi.mocked(notesApi.addSupplierNote).mockRejectedValue(new Error("boom"));
    createAlertWithNote();
    expect(await screen.findByText(/Alert saved, note not saved/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Create Manual Alert/ })).toBeNull());
  });
});
