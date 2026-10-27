// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import * as api from "../src/api/vehicles";
import { ApiError } from "../src/api/client";
import { AgreementForm, SupplierForm, VehicleEntryForm } from "../src/components/vehicles/FleetForms";
import { StatisticsForm } from "../src/components/vehicles/VehicleForms";
import { AgreementCard } from "../src/components/vehicles/AgreementCard";
import { VehicleDetails } from "../src/components/vehicles/VehicleDetails";
import { StatisticsCard } from "../src/components/vehicles/StatisticsCard";
import type { FleetAgreement, FleetSupplier, Snapshot, TripRow, Vehicle } from "../src/types/vehicle";

const vehicle: Vehicle = { registrationNumber: "AB12345", agreementId: "agreement", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", planned: false, listed: true };
const supplier: FleetSupplier = { id: "supplier", name: "Test supplier", orgNumber: "123456789", active: true, updatedAt: vehicle.updatedAt };
const agreement: FleetAgreement = { id: "agreement", supplierId: supplier.id, startDate: "2026-01-01", endDate: "2027-12-31", allowedVehicles: 3, note: "", updatedAt: vehicle.updatedAt, active: true };
const row: TripRow = { id: "period", registrationNumber: vehicle.registrationNumber, createdAt: vehicle.createdAt, estimatedCo2Kg: "120", data: {
  registrationNumber: vehicle.registrationNumber, periodStart: "2026-01-01", periodEnd: "2026-01-31", fuelTechnology: "2", vehicleCategory: "M1", bodyType: "AA", make: "Test", model: "Model",
  co2Registered: true, co2GramsPerKm: "120", totalTripKm: "1000", totalKmCo2Registered: "1000", totalKmCo2NotRegistered: "0", kmFuelNotRegistered: "0", totalKmFuelRegistered: "1000", totalKmNoxRegistered: "500", totalNoxRegisteredGrams: "12.5", averageFuelConsumptionLitresPer100Km: "8", fuelConsumedLitres: "80",
} };
const snapshot: Snapshot = { id: "snapshot", fetchedAt: vehicle.createdAt, source: "STATENS_VEGVESEN_ENKELTOPPSLAG", data: {
  registrationNumber: vehicle.registrationNumber, make: "Test", model: "Model", euroClass: { code: "6", name: "Euro 6" },
  lastApprovedInspectionDate: "2025-01-10", nextInspectionDueDate: "2027-01-10", fuels: [{ fuelTechnology: { code: "2" }, measurements: [
    { measurementMethod: { code: "WLTP" }, co2GramsPerKm: "123.456789", noxMgPerKm: "26.789" },
    { measurementMethod: { code: "NEDC" }, co2GramsPerKm: "120", noxMgPerKm: null },
  ] }],
} };

function mount(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
beforeEach(() => {
  // jsdom has no modal top layer. Test state transitions, not browser focus-trapping behavior.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("vehicle registration and consequential actions", () => {
  it("keeps supplier edits visible when another administrator changed the record", async () => {
    const save = vi.spyOn(api, "saveSupplier").mockRejectedValue(new ApiError(409, "This record changed; reload before editing"));
    const saved = vi.fn();
    mount(<SupplierForm supplier={supplier} onClose={() => {}} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "My edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save supplier" }));
    expect((await screen.findByRole("alert")).textContent).toContain("reload before editing");
    expect((screen.getByLabelText("Supplier name") as HTMLInputElement).value).toBe("My edit");
    expect(saved).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual([{ name: "My edit", orgNumber: supplier.orgNumber }, supplier]);
  });
  it("saves an ordinary agreement edit without extra confirmation", async () => {
    const save = vi.spyOn(api, "saveAgreement").mockResolvedValue({ ...agreement, allowedVehicles: 1 });
    mount(<AgreementForm supplier={supplier} agreement={agreement} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum vehicles" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save agreement" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("keeps unsaved reported data when cancelling discard", () => {
    const closed = vi.fn();
    mount(<StatisticsForm plate={vehicle.registrationNumber} onClose={closed} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: "Keep this note" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const confirmation = screen.getByRole("dialog", { name: "Discard reported data?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(closed).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Comment (optional)") as HTMLTextAreaElement).value).toBe("Keep this note");
  });

  it.each([400, 503])("keeps the registration and permits an explicit retry after HTTP %s", async status => {
    const add = vi.spyOn(api, "addVehicle").mockRejectedValueOnce(new ApiError(status, "Statens vegvesen lookup failed. Try again.")).mockResolvedValue(vehicle);
    const saved = vi.fn();
    mount(<VehicleEntryForm agreementId={agreement.id} onClose={() => {}} onSaved={saved} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Registration number/ }), { target: { value: "AB12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("textbox", { name: /^Registration number/ }) as HTMLInputElement).value).toBe("AB12345");
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1); // Ordinary additions have no extra confirmation.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]).toEqual([agreement.id, { planned: false, registrationNumber: "AB12345" }]);
  });

  it("does not send a replacement until confirmed and cancellation preserves the form", async () => {
    const replace = vi.spyOn(api, "replaceVehicle").mockResolvedValue({ ...vehicle, registrationNumber: "CD12345" });
    mount(<VehicleEntryForm agreementId={agreement.id} replacing={vehicle} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: /^Registration number/ }), { target: { value: "CD12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace vehicle" }));
    const confirmation = screen.getByRole("dialog", { name: "Replace AB12345 with CD12345?" });
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(replace).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: /^Registration number/ }) as HTMLInputElement).value).toBe("CD12345");
    fireEvent.click(screen.getByRole("button", { name: "Replace vehicle" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace AB12345 with CD12345?" })).getByRole("button", { name: "Replace vehicle" }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });

  it("confirms vehicle and agreement removals and cancellation sends no delete", async () => {
    const remove = vi.spyOn(api, "removeVehicle").mockResolvedValue(undefined);
    const removeAgreement = vi.spyOn(api, "removeAgreement").mockResolvedValue(undefined);
    mount(<AgreementCard supplier={supplier} agreement={agreement} vehicles={[vehicle]} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    const confirmation = screen.getByRole("dialog", { name: "Remove AB12345?" });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove AB12345?" })).getByRole("button", { name: "Remove vehicle" }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove.mock.calls[0][0]).toEqual(vehicle);
    fireEvent.click(screen.getByText("Agreement details", { selector: "summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove agreement" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Remove agreement for Test supplier?" })).getByRole("button", { name: "Cancel" }));
    expect(removeAgreement).not.toHaveBeenCalled();
  });
});

describe("statistics source and period presentation", () => {
  it.each([{ rows: [] }, { rows: [row, { ...row, id: "second", data: { ...row.data, periodStart: "2026-02-01", periodEnd: "2026-02-28" } }] }])("shows one registry section above all reporting periods", async ({ rows }) => {
    vi.spyOn(api, "getVehicle").mockResolvedValue({ vehicle, agreement: { agreement, supplier }, tripRows: rows, latestSnapshot: snapshot, latestCheck: null });
    vi.spyOn(api, "getHistory").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    const view = mount(<VehicleDetails plate={vehicle.registrationNumber} onClose={() => {}} />);
    const registry = await screen.findByRole("region", { name: "Vehicle data (Statens vegvesen)" });
    const reported = screen.getByRole("region", { name: "Reported data" });
    expect(registry.compareDocumentPosition(reported) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Vehicle data (Statens vegvesen)" })).toHaveLength(1);
    expect(within(registry).getByText("10.01.2025")).toBeTruthy();
    expect(within(registry).getByText("10.01.2027")).toBeTruthy();
    expect(within(registry).getByText("Euro 6 (6)")).toBeTruthy();
    expect(within(registry).getByText("26.789")).toBeTruthy();
    expect(within(registry).getByText("NEDC")).toBeTruthy();
    expect(view.container.textContent).not.toContain("Jobs/trips");
  });

  it("calculates reported NOx without replacing missing or zero-distance data with zero", () => {
    const view = render(<StatisticsCard row={row} />);
    expect(view.container.textContent).toContain("12.5 g × 1,000 ÷ 500 km = 25 mg/km");
    expect(view.container.textContent).toContain("Reported NOx rate (mg/km)");
    view.rerender(<StatisticsCard row={{ ...row, data: { ...row.data, totalKmNoxRegistered: "0" } }} />);
    expect(view.container.textContent).toContain("NOx rate is unavailable");
    expect(view.container.textContent).not.toContain("= 0 mg/km");
    view.rerender(<StatisticsCard row={{ ...row, data: { ...row.data, totalNoxRegisteredGrams: "0" } }} />);
    expect(view.container.textContent).toContain("= 0 mg/km");
  });
});
