// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("../src/hooks/useDashboardSummary", () => ({ useDashboardSummary: () => ({ data: { topRiskSuppliers: [], recentAlerts: [] } }) }));
vi.mock("../src/hooks/useVehicles", () => ({ useFleet: () => ({ data: { suppliers: [{ id: "org-1", name: "Acme Transport AS", orgNumber: "123456789" }] } }) }));

import { SearchSuppliers } from "../src/components/ui/SearchSuppliers";

function Where() { const location = useLocation(); return <p data-testid="where">{location.pathname + location.search}</p>; }
afterEach(cleanup);

describe("supplier search", () => {
  it("finds a real supplier organization and opens it on the suppliers page", () => {
    render(<MemoryRouter><SearchSuppliers /><Where /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/Søk etter leverandører/), { target: { value: "acme" } });
    fireEvent.click(screen.getByText("Acme Transport AS"));
    expect(screen.getByTestId("where").textContent).toBe("/admin/suppliers?org=org-1");
  });
});
