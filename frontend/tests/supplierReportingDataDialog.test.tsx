// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SupplierReportingDataDialog } from "../src/components/suppliers/SupplierReportingDataDialog";

const supplier = {
  id: "supplier-1",
  name: "Transport AS",
  orgNumber: "123456789",
  active: true,
  updatedAt: "2026-10-01T10:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("supplier reporting data dialog", () => {
  it("shows each requested data type and its submitted records to the administrator", async () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/onboarding/status")) {
        return new Response(JSON.stringify({
          supplierId: supplier.id,
          status: "DATA_DRAFT",
          steps: [],
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          reviewerNotes: null,
          requiredEntities: ["VEHICLES", "ENERGY", "PRODUCTS"],
          canSubmit: false,
        }));
      }
      if (url.includes("/supplier/vehicles")) {
        return new Response(JSON.stringify([{
          registrationNumber: "AB12345",
          agreementId: "agreement-1",
          planned: false,
          listed: true,
          fuelTechnology: "13",
          isHybrid: false,
          fullContractCoverage: true,
          startYearWeek: null,
          endYearWeek: null,
          attachmentReference: null,
          notes: null,
          createdAt: "2026-10-01T10:00:00Z",
          updatedAt: "2026-10-01T10:00:00Z",
        }]));
      }
      if (url.includes("/supplier/energy")) {
        return new Response(JSON.stringify([{
          id: "energy-1",
          agreementId: "agreement-1",
          locationCode: "HQ",
          address: "Main Street 1",
          storageAreaSqm: null,
          workshopAreaSqm: null,
          otherAreaSqm: null,
          reportingYear: 2026,
          electricityKwh: 1200,
          districtHeatingKwh: 0,
          biogasKwh: 0,
          fossilFuelKwh: 0,
          selfProducedSolarKwh: 0,
          selfProducedHeatpumpKwh: 0,
          notes: null,
          createdAt: "2026-10-01T10:00:00Z",
          updatedAt: "2026-10-01T10:00:00Z",
        }]));
      }
      return new Response(JSON.stringify([{
        id: "product-1",
        agreementId: "agreement-1",
        productCode: "CHAIR-1",
        productName: "Office chair",
        productCategory: "FURNITURE",
        ecolabelStandard: "NORDIC_SWAN",
        licenseNumber: "LIC-1",
        unitOfMeasure: "PCS",
        isRepairedOrReused: true,
        notes: null,
        createdAt: "2026-10-01T10:00:00Z",
        updatedAt: "2026-10-01T10:00:00Z",
      }]));
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SupplierReportingDataDialog supplier={supplier} onClose={() => {}} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/AB12345/)).toBeTruthy();
    expect(screen.getByText("HQ")).toBeTruthy();
    expect(screen.getByText("Main Street 1")).toBeTruthy();
    expect(screen.getByText("Office chair")).toBeTruthy();
    expect(screen.getByText("CHAIR-1")).toBeTruthy();
  });
});
