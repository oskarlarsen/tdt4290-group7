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
  it("turns clear form answers into a generated CSV for server validation", () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();
    render(
      <SupplierVehicleEntryForm
        agreements={agreements}
        working={false}
        onPreview={onPreview}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement-1" } });
    fireEvent.change(screen.getByLabelText("Is this vehicle planned?"), { target: { value: "false" } });
    fireEvent.change(screen.getByLabelText("Vehicle registration plate"), { target: { value: "ab12345" } });
    fireEvent.change(screen.getByLabelText("Fuel or propulsion"), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText("Is it a hybrid vehicle?"), { target: { value: "true" } });
    fireEvent.change(screen.getByLabelText("Does it cover the full agreement period?"), { target: { value: "true" } });
    fireEvent.click(screen.getByRole("button", { name: "Review vehicle details" }));

    expect(onPreview).toHaveBeenCalledOnce();
    expect(onPreview.mock.calls[0][0]).toBeInstanceOf(File);
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
