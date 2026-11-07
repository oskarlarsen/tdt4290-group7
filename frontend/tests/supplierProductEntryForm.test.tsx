// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierProductEntryForm } from "../src/components/supplier/SupplierProductEntryForm";

const agreements = [
  {
    id: "agreement-product-1",
    note: "Office furniture supply contract",
    startDate: "2026-01-01",
    endDate: "2027-12-31",
    allowedVehicles: 0,
    activeVehiclesCount: 0,
    active: true,
    requiresVehicles: false,
    requiresEnergy: false,
    requiresProducts: true,
  },
];

afterEach(() => {
  cleanup();
});

describe("supplier product entry form", () => {
  it("turns interactive product answers into a generated CSV for server validation", () => {
    const onPreview = vi.fn();
    const onChange = vi.fn();

    render(
      <SupplierProductEntryForm
        agreements={agreements}
        working={false}
        onPreview={onPreview}
        onChange={onChange}
        mode="form"
      />,
    );

    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agreement-product-1" } });
    fireEvent.change(screen.getByLabelText("Product category"), { target: { value: "FURNITURE" } });
    fireEvent.change(screen.getByLabelText("Product code or SKU"), { target: { value: "FURN-DESK-01" } });
    fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Standing Desk Oak" } });
    fireEvent.change(screen.getByLabelText("Ecolabel standard"), { target: { value: "NORDIC_SWAN" } });
    fireEvent.change(screen.getByLabelText(/License or certification number/), { target: { value: "5020-0011" } });
    fireEvent.change(screen.getByLabelText("Unit of measure"), { target: { value: "PCS" } });
    fireEvent.change(screen.getByLabelText("Repaired or reused product?"), { target: { value: "false" } });

    const reviewButton = screen.getByRole("button", { name: "Review product details" });
    expect((reviewButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(reviewButton);

    expect(onPreview).toHaveBeenCalledOnce();
    expect(onPreview.mock.calls[0][0]).toBeInstanceOf(File);
    expect(onChange).toHaveBeenCalled();
  });

  it("supports adding and removing product rows", () => {
    render(
      <SupplierProductEntryForm
        agreements={agreements}
        working={false}
        onPreview={vi.fn()}
        onChange={vi.fn()}
        mode="form"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add another product" }));
    expect(screen.getByText("Product 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove product 2" }));
    expect(screen.queryByText("Product 2")).toBeNull();
  });

  it("shows the CSV upload instead of the form in CSV mode", () => {
    const onPreview = vi.fn();
    render(<SupplierProductEntryForm agreements={agreements} working={false} onPreview={onPreview} onChange={vi.fn()} mode="csv" />);
    expect(screen.getByRole("button", { name: /Download CSV template/ })).toBeTruthy();
    const file = new File(["a;b"], "products.csv", { type: "text/csv" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(onPreview).toHaveBeenCalledWith(file);
  });
});
