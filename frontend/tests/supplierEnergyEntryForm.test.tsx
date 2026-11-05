// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierEnergyEntryForm } from "../src/components/supplier/SupplierEnergyEntryForm";

const agreements = [
  {
    id: "agreement-energy-1",
    note: "Facility maintenance contract",
    startDate: "2026-01-01",
    endDate: "2027-12-31",
    allowedVehicles: 0,
    activeVehiclesCount: 0,
    active: true,
    requiresVehicles: false,
    requiresEnergy: true,
    requiresProducts: false,
  },
];

afterEach(() => {
  cleanup();
});

describe("supplier energy entry form", () => {
  it("turns interactive facility answers into a generated CSV for server validation", () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();

    render(
      <SupplierEnergyEntryForm
        agreements={agreements}
        working={false}
        onPreview={onPreview}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement-energy-1" } });
    fireEvent.change(screen.getByLabelText("Facility or location code"), { target: { value: "DEPOT-01" } });
    fireEvent.change(screen.getByLabelText("Facility address"), { target: { value: "Kongens gate 1, 7011 Trondheim" } });
    fireEvent.change(screen.getByLabelText("Electricity (kWh)"), { target: { value: "15000" } });
    fireEvent.change(screen.getByLabelText("District heating (kWh)"), { target: { value: "25000" } });

    const reviewButton = screen.getByRole("button", { name: "Review energy details" });
    expect((reviewButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(reviewButton);

    expect(onPreview).toHaveBeenCalledOnce();
    expect(onPreview.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onChange).toHaveBeenCalled();
  });

  it("supports adding and removing facility rows", () => {
    render(
      <SupplierEnergyEntryForm
        agreements={agreements}
        working={false}
        onPreview={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add another facility" }));
    expect(screen.getByText("Facility 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove facility 2" }));
    expect(screen.queryByText("Facility 2")).toBeNull();
  });
});
