// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierDetailsDialog } from "../src/components/suppliers/SupplierDetailsDialog";
import type { RecentAlert, TopRiskSupplier } from "../src/types/dashboard";

const supplier: TopRiskSupplier = {
  id: "supplier-nordvik",
  displayName: "Nordvik Transport AS",
  orgId: "987654321",
  primaryContract: "2024/1234 — School bus",
  risk: "medium",
  mainIssue: "Vehicle check required",
  issueCategories: ["VEHICLE_DEVIATION", "CERTIFICATE_EXPIRY"],
  onboardingStatus: "SUBMITTED",
  agreementCount: 2,
  vehicleCount: 5,
  certificateCount: 0,
  energyRecordCount: 3,
  productCount: 10,
  registeredAccountCount: 1,
};

const alert: RecentAlert = {
  id: "a1", severity: "high", title: "Vehicle deregistered", description: "Statens vegvesen data identifies a vehicle as deregistered.",
  timeAgo: "1d", createdAt: "2026-10-01T10:00:00Z", status: "OPEN", category: "VEHICLE_COMPLIANCE", source: "AUTOMATIC",
  findingType: "CONFIRMED_DEVIATION", supplierId: supplier.id,
};

afterEach(cleanup);

function mount(onClose = vi.fn()) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SupplierDetailsDialog supplier={supplier} alerts={[alert]} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe("supplier details dialog", () => {
  it("shows the full alert text, every category and the counts", () => {
    mount();
    expect(screen.getByText("Statens vegvesen data identifies a vehicle as deregistered.")).toBeTruthy();
    expect(screen.getByText("Kjøretøyavvik, Sertifikatutløp")).toBeTruthy();
    expect(screen.getByText("2 avtaler")).toBeTruthy();
    expect(screen.getByText("5 kjøretøy")).toBeTruthy();
    expect(screen.getByText("3 energirapporter")).toBeTruthy();
    expect(screen.getByText("10 produkter")).toBeTruthy();
  });

  it("shows a placeholder for data the supplier has not provided", () => {
    mount();
    expect(screen.getAllByText("Ikke oppgitt ennå")).toHaveLength(1); // certificates: 0
  });

  it("opens the submitted reporting data dialog", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Vis innsendte rapporteringsdata" }));
    expect(screen.getByText("Innsendt informasjon · Nordvik Transport AS")).toBeTruthy();
  });

  it("closes from the close button", () => {
    const onClose = mount();
    fireEvent.click(screen.getByRole("button", { name: "Lukk Detaljer for Nordvik Transport AS" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
