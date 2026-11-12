// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KpiCard } from "../src/components/ui/KpiCard";

afterEach(cleanup);

describe("KpiCard", () => {
  it("is a link to the filtered list when it has an href", () => {
    render(<MemoryRouter><KpiCard label="High-risk suppliers" value={7} sublabel="/ 151 active" href="/admin/suppliers?risk=high" /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "High-risk suppliers: 7 / 151 active, åpne liste" });
    expect(link.getAttribute("href")).toBe("/admin/suppliers?risk=high");
  });

  it("stays plain without an href", () => {
    render(<KpiCard label="Active suppliers" value={151} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Active suppliers")).toBeTruthy();
  });
});
