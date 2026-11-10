// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierDetailsDrawer } from "../src/components/suppliers/SupplierDetailsDrawer";
import type { RecentAlert, TopRiskSupplier } from "../src/types/dashboard";

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

const alert = (id: string, title: string, status: RecentAlert["status"] = "OPEN", supplierId = supplier.id): RecentAlert => ({
  id, severity: "high", title, description: `Full text of ${title}`, timeAgo: "1d", createdAt: "2026-10-01T10:00:00Z",
  status, category: "VEHICLE_COMPLIANCE", source: "AUTOMATIC", findingType: "CONFIRMED_DEVIATION", supplierId,
});

function mount(props: Partial<Parameters<typeof SupplierDetailsDrawer>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenDetails = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <SupplierDetailsDrawer
        supplier={supplier}
        alerts={[]}
        reviewStatus="to-review"
        onChangeReviewStatus={vi.fn()}
        onOpenDetails={onOpenDetails}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenDetails };
}

afterEach(() => {
  cleanup();
});

describe("supplier details drawer (summary)", () => {
  it("shows the main issue first, then only the key words of unresolved alerts", () => {
    mount({
      alerts: [
        alert("a1", "Vehicle deregistered"),
        alert("a2", "Euro-5 heavy vehicle"),
        alert("a3", "Certificate expired"),
        alert("a4", "Fourth alert"),
        alert("a5", "Already handled", "RESOLVED"),
        alert("a6", "Other supplier alert", "OPEN", "someone-else"),
      ],
    });

    const issue = screen.getByText("Vehicle check required");
    expect(issue.className).toContain("text-red-700");
    expect(screen.getByText("Vehicle deregistered")).toBeTruthy();
    expect(screen.getByText("Euro-5 heavy vehicle")).toBeTruthy();
    expect(screen.getByText("Certificate expired")).toBeTruthy();
    expect(screen.getByText("+1 more")).toBeTruthy();
    expect(screen.queryByText("Fourth alert")).toBeNull();
    expect(screen.queryByText("Already handled")).toBeNull();
    expect(screen.queryByText("Other supplier alert")).toBeNull();
    // Long text and counts belong in the Details window, not the summary.
    expect(screen.queryByText("Full text of Vehicle deregistered")).toBeNull();
    expect(screen.queryByText("2 agreements")).toBeNull();
    expect(screen.queryByRole("button", { name: "View submitted reporting data" })).toBeNull();
  });

  it("calls the follow-up section by that name and drops the stored-locally sentence", () => {
    mount();
    expect(screen.getByText("Follow-up status")).toBeTruthy();
    expect(screen.queryByText(/stored locally/)).toBeNull();
  });

  it("opens the Details window from the Details button", () => {
    const { onOpenDetails } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });
});
