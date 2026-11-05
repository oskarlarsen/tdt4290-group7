// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierDetailsDrawer } from "../src/components/suppliers/SupplierDetailsDrawer";
import type { TopRiskSupplier } from "../src/types/dashboard";

vi.mock("../src/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Test admin" } }) }));

const supplier: TopRiskSupplier = {
  id: "supplier-nordvik",
  displayName: "Nordvik Transport AS",
  orgId: "987654321",
  primaryContract: "School bus contract",
  risk: "medium",
  mainIssue: "Vehicle check required",
  onboardingStatus: "SUBMITTED",
  agreementCount: 2,
  vehicleCount: 5,
  certificateCount: 1,
  energyRecordCount: 3,
  productCount: 10,
  registeredAccountCount: 1,
};

afterEach(() => {
  cleanup();
});

describe("supplier details drawer", () => {
  it("renders supplier details, entity counts, and opens the submitted reporting data dialog", () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SupplierDetailsDrawer
          supplier={supplier}
          alerts={[]}
          reviewStatus="to-review"
          onChangeReviewStatus={vi.fn()}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Nordvik Transport AS")).toBeTruthy();
    expect(screen.getByText("2 agreements")).toBeTruthy();
    expect(screen.getByText("5 vehicles")).toBeTruthy();
    expect(screen.getByText("3 energy records")).toBeTruthy();
    expect(screen.getByText("10 products")).toBeTruthy();

    const viewButton = screen.getByRole("button", { name: "View submitted reporting data" });
    expect(viewButton).toBeTruthy();

    fireEvent.click(viewButton);
    expect(screen.getByText("Submitted information · Nordvik Transport AS")).toBeTruthy();
  });
});
