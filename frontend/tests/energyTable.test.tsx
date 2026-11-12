// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { EnergyTable } from "../src/components/energy/EnergyTable";
import { validateEvidenceFile } from "../src/components/supplier/EnergyEvidencePanel";
import { buildRiskOutlook } from "../src/types/riskOutlook";
import type { DerivedContract } from "../src/types/contract";
import { energyContract } from "./support/energyFixtures";

afterEach(cleanup);

const rows = [
  energyContract({ agreementId: "a", supplierName: "Nordic Transport AS" }),
  energyContract({ agreementId: "b", supplierName: "Bymiljø Drift AS", status: "NON_COMPLIANT", selfProducedDeviationKwh: -600 }),
  energyContract({ agreementId: "c", supplierName: "Trondheim Renovasjon AS", status: "MISSING_DATA", reportedQuarters: [], selfProducedDeviationKwh: null, gooDeviationKwh: null }),
];

describe("EnergyTable", () => {
  it("makes Supplier and Status sortable buttons and reports which column is sorted", () => {
    const onSort = vi.fn();
    render(<EnergyTable rows={rows} sortKey="status" sortDirection="desc" onSort={onSort} onSelect={() => {}} />);

    const status = screen.getByRole("columnheader", { name: /status/i });
    const supplier = screen.getByRole("columnheader", { name: /leverandør/i });
    expect(status.getAttribute("aria-sort")).toBe("descending");
    expect(supplier.getAttribute("aria-sort")).toBe("none");

    fireEvent.click(within(supplier).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("supplier");
    fireEvent.click(within(status).getByRole("button"));
    expect(onSort).toHaveBeenCalledWith("status");
  });

  it("shows a signed deviation, 'Not reported' for a contract without data, and opens details", () => {
    const onSelect = vi.fn();
    render(<EnergyTable rows={rows} sortKey="supplier" sortDirection="asc" onSort={() => {}} onSelect={onSelect} />);

    expect(screen.getByText(/−600 kWh mot forpliktelsen/)).toBeTruthy();
    expect(screen.getAllByText("Ikke rapportert")).toHaveLength(2); // self-produced and GoO cells
    fireEvent.click(screen.getAllByRole("button", { name: "Vis detaljer" })[1]);
    expect(onSelect).toHaveBeenCalledWith(rows[1]);
  });

  it("labels the deviation as projected while the year is open, and not once Q4 is in", () => {
    const open = energyContract({ agreementId: "o", reportedQuarters: [1, 2], selfProducedDeviationKwh: 600, gooDeviationKwh: -100 });
    const closed = energyContract({ agreementId: "c", year: 2025, reportedQuarters: [4], selfProducedDeviationKwh: -900, gooDeviationKwh: -450 });
    render(<EnergyTable rows={[open, closed]} sortKey="status" sortDirection="asc" onSort={() => {}} onSelect={() => {}} />);
    expect(screen.getAllByText(/^Anslått\s/).length).toBe(2); // self-produced and GoO of the open row only
    expect(screen.getByText(/−900 kWh mot forpliktelsen/).textContent).not.toContain("Anslått");
  });

  it("shows exact kWh in the cells", () => {
    render(<EnergyTable rows={[energyContract({ selfProducedKwh: 3500, commitment: { minSelfProducedKwh: 1000, minGooKwh: 500 } })]} sortKey="status" sortDirection="asc" onSort={() => {}} onSelect={() => {}} />);
    expect(screen.getByText(/3.500 kWh/)).toBeTruthy();
    expect(screen.queryByText(/MWh/)).toBeNull();
  });

  it("shows the empty message when there are no rows", () => {
    render(<EnergyTable rows={[]} sortKey="status" sortDirection="asc" onSort={() => {}} onSelect={() => {}} emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });
});

describe("evidence file validation", () => {
  const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

  it("accepts the allowed types regardless of case", () => {
    for (const name of ["meter.pdf", "SOLAR.PNG", "a.jpg", "b.jpeg", "c.csv", "d.xlsx"]) {
      expect(validateEvidenceFile(file(name, 10))).toBeNull();
    }
  });

  it("rejects other types, empty files and files over 10 MB", () => {
    expect(validateEvidenceFile(file("page.html", 10))).toMatch(/PDF-, PNG-/);
    expect(validateEvidenceFile(file("noextension", 10))).toMatch(/PDF-, PNG-/);
    expect(validateEvidenceFile(file("meter.pdf", 0))).toMatch(/tom/);
    expect(validateEvidenceFile(file("meter.pdf", 10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
    expect(validateEvidenceFile(file("meter.pdf", 10 * 1024 * 1024))).toBeNull();
  });
});

describe("risk outlook energy indicators", () => {
  const contract: DerivedContract = {
    id: "agr-1", contractName: "2026/0103", supplierId: "sup-1", supplierName: "Midtnorsk Bygg AS", supplierOrgId: "912345674",
    risk: "compliant", mainIssue: "", status: "Active", startDate: "2026-01-01", endDate: "2027-12-31", documentUrl: null,
  };
  const outlook = (energy: ReturnType<typeof energyContract>[]) =>
    buildRiskOutlook({ contracts: [contract], certificates: [], energy }, new Date("2026-10-30T12:00:00Z"))[0];

  it("raises a high-priority indicator when the commitment is not met", () => {
    const row = outlook([energyContract({ status: "NON_COMPLIANT", selfProducedDeviationKwh: -600 })]);
    expect(row.indicators).toContainEqual(expect.objectContaining({ category: "energy", kind: "active", priority: "high", title: "Energiforpliktelse ikke oppfylt" }));
  });

  it("raises a medium indicator when at risk, and a data gap when nothing was reported", () => {
    expect(outlook([energyContract({ status: "AT_RISK", selfProducedDeviationKwh: -200 })]).indicators)
      .toContainEqual(expect.objectContaining({ priority: "medium", title: "Energiforpliktelse i fare" }));
    expect(outlook([energyContract({ status: "MISSING_DATA", reportedQuarters: [] })]).indicators)
      .toContainEqual(expect.objectContaining({ kind: "data-gap", title: "Energidata ikke innsendt" }));
  });

  it("raises nothing for compliant contracts, contracts without a commitment, or contracts with no energy requirement", () => {
    for (const energy of [[energyContract()], [energyContract({ status: "NO_COMMITMENT", commitment: null })], []]) {
      expect(outlook(energy).indicators.filter((i) => i.category === "energy")).toEqual([]);
    }
  });
});
