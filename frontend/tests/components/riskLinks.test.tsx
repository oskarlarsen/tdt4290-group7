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
  low: { count: 0, percent: 0 },
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
      "/admin/suppliers?risk=low",
      "/admin/suppliers?risk=compliant",
      "/admin/suppliers?risk=unassessed",
    ]);
    expect(links[0].textContent).toContain("7 leverandører");
    expect(links[0].textContent).toContain("Høy risiko");
    expect(links[3].textContent).toContain("Ingen funn");
    expect(links[4].textContent).toContain("Ikke vurdert");
    expect(screen.getByText("151 leverandører totalt")).toBeTruthy();
  });
});

describe("IssueCategoryPanel", () => {
  it("links the vehicle, certificate and energy tiles", () => {
    render(
      <MemoryRouter>
        <IssueCategoryPanel data={{ vehicleDeviation: 3, certificateExpiry: 2, energyDeviation: 1, modeledSupplierCount: 5 }} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: "Kjøretøyavvik: 3, åpne liste" }).getAttribute("href")).toBe("/admin/suppliers?issue=vehicle");
    expect(screen.getByRole("link", { name: "Sertifikatproblemer: 2, åpne liste" }).getAttribute("href")).toBe("/admin/suppliers?issue=certificate");
    expect(screen.getByRole("link", { name: "Energiavvik: 1, åpne liste" }).getAttribute("href")).toBe("/admin/suppliers?issue=energy");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
