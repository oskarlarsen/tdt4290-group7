import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { replaceVehicle, removeVehicle, undoChange } from "../src/api/vehicles";
import { VehicleEntryForm } from "../src/components/vehicles/FleetForms";
import { agreementDuration, vehicleDate } from "../src/utils/vehicle";
import type { Vehicle } from "../src/types/vehicle";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const vehicle: Vehicle = { registrationNumber: "AB12345", agreementId: "agreement", createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-01T10:00:00Z", planned: false, listed: true };

describe("agreement vehicle actions", () => {
  it("uses a real session while prototype data remains enabled", async () => {
    vi.stubEnv("VITE_MOCK_AUTH", "false");
    vi.stubEnv("VITE_USE_MOCKS", "true");
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"admin","role":"ADMIN"}'));
    vi.stubGlobal("fetch", fetch);
    const { getCurrentUser } = await import("../src/api/auth");
    await getCurrentUser();
    expect(fetch.mock.calls[0][0]).toContain("/auth/me");
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
  });
  it("replaces in one request and sends the record version for conflict detection", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}"))); vi.stubGlobal("fetch", fetch);
    await replaceVehicle(vehicle, { planned: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain("/vehicle-fleet/vehicles/AB12345/replace");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ replacement: { planned: true }, expectedUpdatedAt: vehicle.updatedAt });
    await removeVehicle(vehicle);
    expect(fetch.mock.calls[1][1].method).toBe("DELETE");
    await undoChange("change-id");
    expect(fetch.mock.calls[2][0]).toContain("/history/change-id/undo");
  });
  it("offers a registration-pending switch without requiring technical vehicle details", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><VehicleEntryForm agreementId="agreement" onClose={() => {}} onSaved={() => {}} /></QueryClientProvider>);
    expect(html).toContain('role="switch"'); expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Registration pending");
    expect(html).toContain("Reserves one vehicle place until the registration number is available.");
    expect(html).not.toContain("Fuel"); expect(html).not.toContain("Vehicle category");
  });
  it("formats dates in Norwegian order and counts the inclusive agreement period", () => {
    expect(vehicleDate("2026-10-20")).toBe("20.10.2026");
    expect(agreementDuration("2026-01-01", "2026-01-31")).toBe("31 days");
    expect(agreementDuration("2028-02-28", "2028-03-01")).toBe("3 days");
    expect(agreementDuration("2026-02-30", "2026-03-01")).toBe("");
  });
});
