// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierVehicleEntryForm } from "../src/components/supplier/SupplierVehicleEntryForm";

const agreements = [{
  id: "agreement-1",
  note: "Transport services",
  saksnr: "2024/1234",
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  allowedVehicles: 4,
  activeVehiclesCount: 0,
  active: true,
  requiresVehicles: true,
  requiresEnergy: false,
  requiresProducts: false,
}];

afterEach(() => {
  cleanup();
});

describe("supplier vehicle entry form", () => {
  function mount(onPreview = vi.fn(), onChange = vi.fn()) {
    render(<SupplierVehicleEntryForm agreements={agreements} working={false} onPreview={onPreview} onChange={onChange} />);
    return { onPreview, onChange };
  }

  async function csvOf(file: File) { return await file.text(); }

  it("needs only the plate, the agreement and the period for a registered vehicle", async () => {
    const { onPreview, onChange } = mount();
    const review = screen.getByRole("button", { name: "Review vehicle details" }) as HTMLButtonElement;
    expect(review.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement-1" } });
    fireEvent.change(screen.getByLabelText(/has a registration plate yet|have a registration plate yet/), { target: { value: "true" } });
    fireEvent.change(screen.getByLabelText(/^Registration plate/), { target: { value: "ab12345" } });
    fireEvent.change(screen.getByLabelText("Will it be used for the whole agreement period?"), { target: { value: "true" } });
    // No fuel and no hybrid question: Statens vegvesen fills them in at review.
    expect(screen.queryByLabelText(/hybrid/i)).toBeNull();
    expect(review.disabled).toBe(false);
    fireEvent.click(review);

    expect(onPreview).toHaveBeenCalledOnce();
    const csv = await csvOf(onPreview.mock.calls[0][0] as File);
    expect(csv).toContain("agreement-1;AB12345;FALSE;;;TRUE;");
    expect(onChange).toHaveBeenCalled();
  });

  it("asks for a fuel only when the vehicle has no plate yet", async () => {
    const { onPreview } = mount();
    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement-1" } });
    fireEvent.change(screen.getByLabelText(/have a registration plate yet/), { target: { value: "false" } });
    fireEvent.change(screen.getByLabelText("Will it be used for the whole agreement period?"), { target: { value: "true" } });
    const review = screen.getByRole("button", { name: "Review vehicle details" }) as HTMLButtonElement;
    expect(review.disabled).toBe(true);
    expect(screen.queryByLabelText(/^Registration plate/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Fuel or propulsion/), { target: { value: "13" } });
    expect(review.disabled).toBe(false);
    fireEvent.click(review);
    expect(await csvOf(onPreview.mock.calls[0][0] as File)).toContain("agreement-1;;TRUE;13;;TRUE;");
  });

  it("uses a week picker for part-period coverage", async () => {
    const { onPreview } = mount();
    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement-1" } });
    fireEvent.change(screen.getByLabelText(/have a registration plate yet/), { target: { value: "true" } });
    fireEvent.change(screen.getByLabelText(/^Registration plate/), { target: { value: "AB12345" } });
    fireEvent.change(screen.getByLabelText("Will it be used for the whole agreement period?"), { target: { value: "false" } });
    const from = screen.getByLabelText("Used from week") as HTMLInputElement;
    expect(from.type).toBe("week");
    fireEvent.change(from, { target: { value: "2026-W08" } });
    fireEvent.change(screen.getByLabelText("Used until week"), { target: { value: "2026-W52" } });
    fireEvent.click(screen.getByRole("button", { name: "Review vehicle details" }));
    expect(await csvOf(onPreview.mock.calls[0][0] as File)).toContain("FALSE;2026-W08;2026-W52;");
  });

  it("offers the CSV template and previews an uploaded CSV file", () => {
    const { onPreview, onChange } = mount();
    expect(screen.getByRole("button", { name: /Download CSV template/ })).toBeTruthy();
    const file = new File(["agreement_id;registration_number"], "vehicles.csv", { type: "text/csv" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(onPreview).toHaveBeenCalledWith(file);
    expect(onChange).toHaveBeenCalled();
  });

  it("supports adding and removing vehicle rows", () => {
    render(
      <SupplierVehicleEntryForm
        agreements={agreements}
        working={false}
        onPreview={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add another vehicle" }));
    expect(screen.getByText("Vehicle 2")).toBeTruthy();
    expect(screen.getAllByRole("option", { name: "2024/1234 — Transport services" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remove vehicle 2" }));
    expect(screen.queryByText("Vehicle 2")).toBeNull();
  });
});
