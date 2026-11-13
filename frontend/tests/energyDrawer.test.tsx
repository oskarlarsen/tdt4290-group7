// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// A plain function, not a vi.fn spy: Vitest reports a spy that returns a rejected promise as a test failure even when the code under test handles it.
const api = vi.hoisted(() => ({
  calls: [] as unknown[][],
  impl: (() => Promise.resolve()) as () => Promise<void>,
}));
vi.mock("../src/api/energy", () => ({
  setEnergyCommitment: (...args: unknown[]) => {
    api.calls.push(args);
    return api.impl();
  },
  adminEnergyEvidenceHref: (id: string) => `/api/admin/energy/evidence/${id}`,
}));

import { EnergyDetailsDrawer } from "../src/components/energy/EnergyDetailsDrawer";
import { energyContract } from "./support/energyFixtures";

beforeEach(() => {
  api.calls.length = 0;
  api.impl = () => Promise.resolve();
});
afterEach(cleanup);

function renderDrawer(row: ReturnType<typeof energyContract>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (r: typeof row) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EnergyDetailsDrawer row={r} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(ui(row));
  return { rerenderWith: (next: typeof row) => view.rerender(ui(next)) };
}

const selfInput = () => screen.getByLabelText(/Forpliktet egenprodusert energi/);
const gooInput = () => screen.getByLabelText(/Minimum energi dekket av opprinnelsesgarantier/);
const saveButton = () => screen.getByRole("button", { name: /Lagre forpliktelse/ }) as HTMLButtonElement;

describe("commitment form", () => {
  it("explains why a negative or too large value cannot be saved", () => {
    renderDrawer(energyContract({ commitment: null, status: "NO_COMMITMENT" }));
    fireEvent.change(selfInput(), { target: { value: "-5" } });
    fireEvent.change(gooInput(), { target: { value: "100" } });
    expect(screen.getByRole("alert").textContent).toMatch(/fra 0 til/);
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(selfInput(), { target: { value: "1e30" } });
    expect(screen.getByRole("alert").textContent).toMatch(/fra 0 til/);
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(selfInput(), { target: { value: "1000" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps the Saved note after the data refetches with the new commitment, and clears it on edit", async () => {
    const row = energyContract({ commitment: null, status: "NO_COMMITMENT" });
    const { rerenderWith } = renderDrawer(row);
    fireEvent.change(selfInput(), { target: { value: "1000" } });
    fireEvent.change(gooInput(), { target: { value: "500" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText("Lagret")).toBeTruthy());
    expect(api.calls).toEqual([[row.agreementId, { minSelfProducedKwh: 1000, minGooKwh: 500 }]]);

    // The save refetches the list, so the drawer gets a row that now carries the commitment.
    rerenderWith({ ...row, commitment: { minSelfProducedKwh: 1000, minGooKwh: 500 }, status: "COMPLIANT" });
    expect(screen.getByText("Lagret")).toBeTruthy();
    expect((selfInput() as HTMLInputElement).value).toBe("1000");

    fireEvent.change(gooInput(), { target: { value: "600" } });
    expect(screen.queryByText("Lagret")).toBeNull();
  });

  it("shows a server error and does not claim it saved", async () => {
    api.impl = () => Promise.reject(new Error("minGooKwh må være mellom 0 og 10 000 000 000 kWh"));
    renderDrawer(energyContract());
    fireEvent.change(gooInput(), { target: { value: "700" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByText(/må være mellom/)).toBeTruthy());
    expect(screen.queryByText("Lagret")).toBeNull();
  });
});

describe("drawer wording", () => {
  it("says projected for an open year and plain deviation for a closed one", () => {
    renderDrawer(energyContract({ reportedQuarters: [1, 2], selfProducedDeviationKwh: 0, gooDeviationKwh: -100 }));
    expect(screen.getByText(/Anslått avvik ved årsslutt/)).toBeTruthy();
    cleanup();
    renderDrawer(energyContract({ year: 2025, reportedQuarters: [4], selfProducedDeviationKwh: -900, gooDeviationKwh: -450 }));
    expect(screen.queryByText(/Anslått avvik ved årsslutt/)).toBeNull();
    expect(screen.getByText(/^Avvik: egenprodusert/)).toBeTruthy();
  });
});
