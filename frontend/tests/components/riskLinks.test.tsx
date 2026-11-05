// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RiskClassificationBar } from "../../src/components/risk/RiskClassificationBar";
import { IssueCategoryPanel } from "../../src/components/risk/IssueCategoryPanel";

afterEach(cleanup);

const data = {
  compliant: { count: 118, percent: 78 },
  medium: { count: 26, percent: 17 },
  high: { count: 7, percent: 5 },
  unassessed: { count: 0, percent: 0 },
};

describe("RiskClassificationBar", () => {
  it("shows one row per level, high first, each linking to the filtered list", () => {
    render(<MemoryRouter><RiskClassificationBar data={data} /></MemoryRouter>);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/admin/suppliers?risk=high",
      "/admin/suppliers?risk=medium",
      "/admin/suppliers?risk=compliant",
      "/admin/suppliers?risk=unassessed",
    ]);
    expect(links[0].textContent).toContain("7 suppliers");
    expect(links[0].textContent).toContain("High risk");
    expect(links[2].textContent).toContain("No flagged evidence");
    expect(links[3].textContent).toContain("Not assessed");
    expect(screen.getByText("151 suppliers total")).toBeTruthy();
  });
});

describe("IssueCategoryPanel", () => {
  it("links the vehicle and certificate tiles but not the fuel tile", () => {
    render(
      <MemoryRouter>
        <IssueCategoryPanel data={{ vehicleDeviation: 3, certificateExpiry: 2, fuelDeviation: null, modeledSupplierCount: 5 }} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Vehicle deviations: 3, open list" }).getAttribute("href")).toBe("/admin/suppliers?issue=vehicle");
    expect(screen.getByRole("link", { name: "Certificate issues: 2, open list" }).getAttribute("href")).toBe("/admin/suppliers?issue=certificate");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
