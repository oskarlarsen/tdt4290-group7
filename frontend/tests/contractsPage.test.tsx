// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Contracts from "../src/pages/admin/Contracts";
import { formatDate } from "../src/utils/formatDate";

const supplier = { id: "supplier-1", name: "Canonical Transport AS", orgNumber: "123456789", active: true, updatedAt: "2026-10-01T10:00:00Z" };
const agreement = { id: "agreement-1", supplierId: supplier.id, startDate: "2026-01-01", endDate: "2027-12-31", allowedVehicles: 4, note: "Transport services", saksnr: "2024/1234", updatedAt: "2026-10-01T10:00:00Z", active: true };

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><Contracts /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("admin supplier agreements page", () => {
  it("loads canonical agreements and persists new agreements through the fleet API", async () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/vehicle-fleet/agreements") && init?.method === "POST") {
        return new Response(JSON.stringify({ ...agreement, id: "agreement-2", note: "New agreement", startDate: "2026-11-01", endDate: "2027-10-31" }), { status: 201 });
      }
      return new Response(JSON.stringify({ suppliers: [supplier], agreements: [agreement], vehicles: [], changes: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    mount();

    expect(await screen.findByText("Canonical Transport AS · 2024/1234 — Transport services")).toBeTruthy();
    expect(screen.queryByText(/Environmental compliance is not assessed/)).toBeNull();
    expect(screen.getByText(`Expires on ${formatDate("2027-12-31")}`)).toBeTruthy();
    expect(fetch.mock.calls[0][0]).toContain("/vehicle-fleet");

    fireEvent.click(screen.getByRole("button", { name: "Add agreement" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Supplier" }), { target: { value: supplier.id } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText(/Saksnr/), { target: { value: " 2025/77 " } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2027-10-31" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum vehicles" }), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "New agreement" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Energy" }));
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));

    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const request = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(request?.[0]).toContain("/vehicle-fleet/agreements");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      supplierId: supplier.id,
      saksnr: "2025/77",
      startDate: "2026-11-01",
      endDate: "2027-10-31",
      allowedVehicles: 3,
      note: "New agreement",
      requiresVehicles: true,
      requiresEnergy: true,
      requiresProducts: false,
    });
  });

  it("flags agreements without a saksnr and can filter to them", async () => {
    const old = { ...agreement, id: "agreement-old", saksnr: null, note: "Old agreement" };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ suppliers: [supplier], agreements: [agreement, old], vehicles: [], changes: [] }), { status: 200 })));
    mount();

    expect(await screen.findByText("Canonical Transport AS · Saksnr missing — Old agreement")).toBeTruthy();
    expect(screen.getAllByText("Saksnr missing")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add saksnr" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Agreement status"), { target: { value: "Missing saksnr" } });
    expect(screen.queryByText("Canonical Transport AS · 2024/1234 — Transport services")).toBeNull();
    expect(screen.getByText("Canonical Transport AS · Saksnr missing — Old agreement")).toBeTruthy();
  });

  it("opens the agreement details from its name and shows the saksnr and end date", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ suppliers: [supplier], agreements: [agreement], vehicles: [], changes: [] }), { status: 200 })));
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Canonical Transport AS · 2024/1234 — Transport services" }));
    const drawer = screen.getByRole("dialog", { name: "2024/1234 — Transport services details" });
    expect(drawer.textContent).toContain("2024/1234");
    expect(drawer.textContent).toContain(formatDate("2027-12-31"));
    expect(drawer.textContent).toContain("Canonical Transport AS");
    expect(drawer.textContent).toContain("123456789");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "2024/1234 — Transport services details" })).toBeNull();
  });
});
