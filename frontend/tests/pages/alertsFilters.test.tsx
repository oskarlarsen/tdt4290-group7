// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RecentAlert } from "../../src/types/dashboard";

const alert = (id: string, status: RecentAlert["status"]): RecentAlert => ({
  id, severity: "medium", title: `Alert ${id}`, description: "d", timeAgo: "1d", createdAt: "2026-10-01T10:00:00Z",
  status, category: "VEHICLE_COMPLIANCE", source: "AUTOMATIC", findingType: "CONFIRMED_DEVIATION",
});
const alerts = [alert("open", "OPEN"), alert("progress", "IN_PROGRESS"), alert("review", "UNDER_REVIEW"), alert("done", "RESOLVED")];

vi.mock("../../src/hooks/useAlerts", () => ({ useAlerts: () => ({ data: alerts, isLoading: false, isError: false }) }));
// The fleet request fails (as it does in mock mode with no backend): the page must still render.
vi.mock("../../src/hooks/useVehicles", () => ({ useFleet: () => ({ data: undefined, isLoading: false, isError: true }) }));
vi.mock("../../src/hooks/useDashboardSummary", () => ({
  useDashboardSummary: () => ({ data: undefined }),
  useUpdateAlertStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));

import Alerts from "../../src/pages/admin/Alerts";

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; }
function mount(url: string) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Alerts /><Where /></MemoryRouter></QueryClientProvider>);
}
afterEach(cleanup);

describe("admin alerts page filters", () => {
  it("shows only unresolved alerts for ?status=unresolved", () => {
    mount("/admin/alerts?status=unresolved");
    expect(screen.getByText("Alert open")).toBeTruthy();
    expect(screen.getByText("Alert progress")).toBeTruthy();
    expect(screen.getByText("Alert review")).toBeTruthy();
    expect(screen.queryByText("Alert done")).toBeNull();
    expect((screen.getByLabelText("Filter alerts by status") as HTMLSelectElement).value).toBe("UNRESOLVED");
  });

  it("renders without agreement data and shows everything by default", () => {
    mount("/admin/alerts");
    expect(screen.getByText("Alert done")).toBeTruthy();
    expect(screen.queryByText(/Couldn't load alerts/)).toBeNull();
  });

  it("writes the chosen status back to the URL and drops it for All", () => {
    mount("/admin/alerts?status=unresolved");
    const select = screen.getByLabelText("Filter alerts by status");
    fireEvent.change(select, { target: { value: "RESOLVED" } });
    expect(screen.getByTestId("where").textContent).toBe("/admin/alerts?status=resolved");
    expect(screen.getByText("Alert done")).toBeTruthy();
    expect(screen.queryByText("Alert open")).toBeNull();
    fireEvent.change(select, { target: { value: "ALL" } });
    expect(screen.getByTestId("where").textContent).toBe("/admin/alerts");
  });
});
