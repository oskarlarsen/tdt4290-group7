// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AccessEntry } from "../src/api/access";

const api = vi.hoisted(() => ({ getAccess: vi.fn(), getPendingInvitations: vi.fn(), inviteToAccess: vi.fn(), renewAccess: vi.fn(), revokeAccess: vi.fn(), approveAccess: vi.fn() }));
vi.mock("../src/api/access", () => api);
const fleet = vi.hoisted(() => ({ inviteSupplier: vi.fn() }));
vi.mock("../src/api/vehicles", () => fleet);

import { AccessPanel, canRenew } from "../src/components/access/AccessPanel";

const day = 86_400_000;
const entry = (id: string, extra: Partial<AccessEntry> = {}): AccessEntry => ({
  id, name: `Person ${id}`, email: `${id}@example.no`, role: "SUPPLIER", supplierId: "s1", grantedBy: "Owner", accessExpiresAt: null,
  approved: false, permanent: false, active: true, isYou: false, ...extra,
});

function mount(mode: "supplier" | "admin") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AccessPanel mode={mode} /></QueryClientProvider>);
}
beforeEach(() => { api.getPendingInvitations.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("canRenew", () => {
  const now = Date.parse("2026-06-01T10:00:00Z");
  it("offers renewal within 14 days of the end or after it, never for your own, permanent or open-ended access", () => {
    expect(canRenew(entry("a", { accessExpiresAt: new Date(now + 20 * day).toISOString() }), now)).toBe(false);
    expect(canRenew(entry("a", { accessExpiresAt: new Date(now + 14 * day).toISOString() }), now)).toBe(true);
    expect(canRenew(entry("a", { accessExpiresAt: new Date(now - day).toISOString(), active: false }), now)).toBe(true);
    expect(canRenew(entry("a", { accessExpiresAt: new Date(now + day).toISOString(), isYou: true }), now)).toBe(false);
    expect(canRenew(entry("a", { permanent: true }), now)).toBe(false);
    expect(canRenew(entry("a"), now)).toBe(false);
  });
});

describe("access panel", () => {
  it("lists invitations that have not been activated yet", async () => {
    api.getAccess.mockResolvedValue([]);
    api.getPendingInvitations.mockResolvedValue([{ email: "waiting@example.no", role: "SUPPLIER", supplierId: "s1", supplierName: "Acme AS", expiresAt: "2026-06-03T10:00:00Z", accessExpiresAt: null, contact: false }]);
    mount("admin");
    expect(await screen.findByText("waiting@example.no")).toBeTruthy();
    expect(screen.getByText(/Ikke aktivert ennå/)).toBeTruthy();
  });

  it("creates a new link for a pending colleague whose link was lost", async () => {
    api.getAccess.mockResolvedValue([]);
    api.getPendingInvitations.mockResolvedValue([{ email: "waiting@example.no", role: "SUPPLIER", supplierId: "s1", supplierName: "Acme AS", expiresAt: "2026-06-03T10:00:00Z", accessExpiresAt: null, contact: false }]);
    api.inviteToAccess.mockResolvedValue({ email: "waiting@example.no", token: "fresh", expiresAt: "x", accessExpiresAt: null });
    mount("supplier");
    fireEvent.click(await screen.findByRole("button", { name: "Opprett ny lenke" }));
    expect(await screen.findByText(/accept-invitation#fresh/)).toBeTruthy();
    expect(api.inviteToAccess).toHaveBeenCalledWith("supplier", "waiting@example.no", undefined);
  });

  it("only lets an admin replace a contact invitation", async () => {
    api.getAccess.mockResolvedValue([]);
    api.getPendingInvitations.mockResolvedValue([{ email: "contact@example.no", role: "SUPPLIER", supplierId: "s1", supplierName: "Acme AS", expiresAt: "2026-06-03T10:00:00Z", accessExpiresAt: null, contact: true }]);
    fleet.inviteSupplier.mockResolvedValue({ email: "contact@example.no", token: "again", expiresAt: "x" });
    mount("supplier");
    await screen.findByText("contact@example.no");
    expect(screen.queryByRole("button", { name: "Opprett ny lenke" })).toBeNull();
    cleanup();
    mount("admin");
    fireEvent.click(await screen.findByRole("button", { name: "Opprett ny lenke" }));
    expect(await screen.findByText(/accept-invitation#again/)).toBeTruthy();
    expect(fleet.inviteSupplier).toHaveBeenCalledWith("s1", "contact@example.no");
  });

  it("invites a colleague and shows the link to pass on", async () => {
    api.getAccess.mockResolvedValue([]);
    api.inviteToAccess.mockResolvedValue({ email: "new@example.no", token: "tok123", expiresAt: "x", accessExpiresAt: null });
    mount("supplier");
    fireEvent.change(screen.getByLabelText(/E-postadresse/), { target: { value: " new@example.no " } });
    fireEvent.change(screen.getByLabelText(/Midlertidig tilgang til/), { target: { value: new Date(Date.now() + 5 * day).toISOString().slice(0, 10) } });
    fireEvent.click(screen.getByRole("button", { name: "Opprett invitasjon" }));
    await waitFor(() => expect(api.inviteToAccess).toHaveBeenCalledWith("supplier", "new@example.no", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)));
    expect(await screen.findByText(/accept-invitation#tok123/)).toBeTruthy();
  });

  it("lets an admin invite an administrator and approve, renew or remove access", async () => {
    api.getAccess.mockResolvedValue([
      entry("soon", { accessExpiresAt: new Date(Date.now() + 5 * day).toISOString() }),
      entry("me", { isYou: true, permanent: true, grantedBy: null }),
    ]);
    api.approveAccess.mockResolvedValue(undefined);
    api.renewAccess.mockResolvedValue(undefined);
    api.revokeAccess.mockResolvedValue(undefined);
    mount("admin");
    expect(screen.getByText("Inviter en administrator")).toBeTruthy();
    expect(await screen.findByText("Person soon")).toBeTruthy();
    expect(screen.getByText(/Person me \(deg\)/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Fjern tilgang/ })).toHaveLength(1); // not for yourself

    fireEvent.click(screen.getByRole("button", { name: "Godkjenn" }));
    await waitFor(() => expect(api.approveAccess).toHaveBeenCalledWith("soon"));
    fireEvent.click(screen.getByRole("button", { name: "Forny" }));
    const newEnd = new Date(Date.now() + 40 * day).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText("Ny sluttdato"), { target: { value: newEnd } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(api.renewAccess).toHaveBeenCalledWith("soon", newEnd));
    fireEvent.click(screen.getByRole("button", { name: "Fjern tilgang for Person soon" }));
    await waitFor(() => expect(api.revokeAccess).toHaveBeenCalledWith("soon"));
  });

  it("shows the server's reason when something is refused", async () => {
    api.getAccess.mockResolvedValue([entry("x")]);
    api.revokeAccess.mockRejectedValue(new Error("Only the person who gave this access, or an administrator, can remove it"));
    mount("supplier");
    fireEvent.click(await screen.findByRole("button", { name: "Fjern tilgang for Person x" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Only the person who gave this access/)).toBeTruthy();
  });
});
