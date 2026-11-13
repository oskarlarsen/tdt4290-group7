// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArchivedSuppliers } from "../src/components/suppliers/ArchivedSuppliers";
import { SupplierForm } from "../src/components/vehicles/FleetForms";
import type { ArchivedSupplier, FleetSupplier } from "../src/types/vehicle";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const archivedSupplier: FleetSupplier = { id: "s1", name: "Old Transport AS", orgNumber: "123456789", active: false, updatedAt: "2026-01-01T10:00:00Z" };
const wrap = (node: React.ReactNode) => {
  // jsdom has no modal dialog support.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  return mount(node);
};
const mount = (node: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("returning supplier", () => {
  it("asks whether an archived organization number is the same supplier and reactivates on yes", async () => {
    const match = { error: "This organization number belonged to an archived supplier", code: "ARCHIVED_SUPPLIER_MATCH", supplier: archivedSupplier, archivedAt: "2026-01-02T10:00:00Z", agreementCount: 2 };
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(match, 409))
      .mockResolvedValueOnce(json({ ...archivedSupplier, active: true }));
    vi.stubGlobal("fetch", fetch);
    const onSaved = vi.fn();
    wrap(<SupplierForm onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Leverandørnavn"), { target: { value: "Old Transport" } });
    fireEvent.change(screen.getByLabelText("Organisasjonsnummer"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByText("Lagre leverandør"));

    expect(await screen.findByText(/Er dette den samme leverandøren\?/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Old Transport AS");
    expect(screen.getByRole("alert").textContent).toContain("etter 2 avtaler");

    fireEvent.click(screen.getByText("Ja, reaktiver Old Transport AS"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toEqual({ ...archivedSupplier, active: true });
    expect(fetch.mock.calls[1][0]).toContain("/vehicle-fleet/suppliers/s1/reactivate");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ expectedUpdatedAt: "2026-01-01T10:00:00Z" });
  });

  it("goes back to the form on no, and shows other conflicts as a plain error", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ error: "This organization number belonged to an archived supplier", code: "ARCHIVED_SUPPLIER_MATCH", supplier: archivedSupplier, archivedAt: null, agreementCount: 1 }, 409))
      .mockResolvedValueOnce(json({ error: "This organization number already belongs to a supplier" }, 409));
    vi.stubGlobal("fetch", fetch);
    wrap(<SupplierForm onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("Leverandørnavn"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Organisasjonsnummer"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByText("Lagre leverandør"));
    fireEvent.click(await screen.findByText("Nei, sjekk nummeret"));
    await waitFor(() => expect(screen.queryByText(/Er dette den samme leverandøren\?/)).toBeNull());
    fireEvent.click(screen.getByText("Lagre leverandør"));
    expect((await screen.findByRole("alert")).textContent).toBe("This organization number already belongs to a supplier");
  });

  it("warns when only the name matches an archived supplier and lets the admin create a new one anyway", async () => {
    const warning = { error: "An archived supplier has the same name", code: "ARCHIVED_SUPPLIER_NAME_MATCH", supplier: archivedSupplier, archivedAt: "2026-01-02T10:00:00Z", agreementCount: 1 };
    const created = { id: "s2", name: "Old Transport AS", orgNumber: "222222222", active: true, updatedAt: "2026-02-01T10:00:00Z" };
    const fetch = vi.fn().mockResolvedValueOnce(json(warning, 409)).mockResolvedValueOnce(json(created, 201));
    vi.stubGlobal("fetch", fetch);
    const onSaved = vi.fn();
    wrap(<SupplierForm onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Leverandørnavn"), { target: { value: "Old Transport AS" } });
    fireEvent.change(screen.getByLabelText("Organisasjonsnummer"), { target: { value: "222222222" } });
    fireEvent.click(screen.getByText("Lagre leverandør"));
    expect(await screen.findByText(/En arkivert leverandør har samme navn/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("123456789");
    expect(screen.getByRole("alert").textContent).toContain("222222222");
    expect(JSON.parse(fetch.mock.calls[0][1].body).confirmNewSupplier).toBeUndefined();

    fireEvent.click(screen.getByText("Nei, opprett en ny leverandør"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ name: "Old Transport AS", orgNumber: "222222222", confirmNewSupplier: true });
    expect(onSaved.mock.calls[0][0]).toEqual(created);
  });

  it("lists archived suppliers with their agreements and reactivates one", async () => {
    const entry: ArchivedSupplier = {
      supplier: archivedSupplier, archivedAt: "2026-01-02T10:00:00Z",
      agreements: [{ id: "a1", supplierId: "s1", saksnr: "2020/1", startDate: "2020-01-01", endDate: "2021-12-31", allowedVehicles: 3, note: "", updatedAt: "x", active: false, requiresVehicles: true, requiresEnergy: false, requiresProducts: false }],
      vehicles: [{ registrationNumber: "AB12345", agreementId: "a1", createdAt: "x", updatedAt: "x", planned: false, listed: false }],
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ suppliers: [entry] }))
      .mockResolvedValueOnce(json({ ...archivedSupplier, active: true }))
      .mockResolvedValue(json({ suppliers: [] }));
    vi.stubGlobal("fetch", fetch);
    const onReactivated = vi.fn();
    wrap(<ArchivedSuppliers onReactivated={onReactivated} />);
    expect(await screen.findByText("Arkiverte leverandører (1)")).toBeTruthy();
    expect(screen.getByText("Old Transport AS")).toBeTruthy();
    expect(screen.getByText(/2020-01-01 til 2021-12-31 · 2020\/1 · opptil 3 kjøretøy · 1 registrert/)).toBeTruthy();
    fireEvent.click(screen.getByText("Reaktiver"));
    await waitFor(() => expect(onReactivated).toHaveBeenCalledWith({ ...archivedSupplier, active: true }));
  });

  it("shows nothing when no supplier has been archived", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ suppliers: [] })));
    const { container } = wrap(<ArchivedSuppliers onReactivated={() => {}} />);
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1));
    expect(container.textContent).toBe("");
  });
});
