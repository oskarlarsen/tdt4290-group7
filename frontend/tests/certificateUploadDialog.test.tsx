// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateUploadDialog } from "../src/components/certificates/CertificateUploadDialog";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("../src/hooks/useCertificates", () => ({
  useUploadCertificate: () => ({ mutate, isPending: false, isError: false }),
}));

describe("certificate upload dialog", () => {
  beforeEach(() => mutate.mockClear());
  afterEach(cleanup);

  it("submits the selected supplier's contract ID with the PDF", () => {
    render(
      <CertificateUploadDialog
        contracts={[
          {
            id: "sup-a",
            contractName: "Example transport contract",
            supplierId: "sup-a",
            supplierName: "Example Transport AS",
            supplierOrgId: "NO 123 456 789 MVA",
            risk: "compliant",
            mainIssue: "",
            status: "Active",
            startDate: "2026-01-01",
            endDate: "2027-12-31",
            documentUrl: null,
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Leverandør og avtale"), {
      target: { value: "Example Transport AS (NO 123 456 789 MVA) — Example transport contract" },
    });
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["demo"], "certificate.pdf", { type: "application/pdf" })] },
    });
    fireEvent.submit(screen.getByRole("dialog"));

    expect(mutate).toHaveBeenCalledWith(
      {
        file: expect.any(File),
        supplierName: "Example Transport AS",
        contractId: "sup-a",
      },
      { onSuccess: expect.any(Function) },
    );
  });

  it("offers every agreement as a suggestion and refuses text that matches none", () => {
    render(
      <CertificateUploadDialog
        contracts={[
          { id: "a", contractName: "2024/1 — Skolerute", supplierId: "s1", supplierName: "Nordvik AS", supplierOrgId: "111", startDate: "2026-01-01", endDate: "2027-01-01" },
          { id: "b", contractName: "2025/2 — Avfall", supplierId: "s2", supplierName: "Sørli AS", supplierOrgId: "222", startDate: "2026-01-01", endDate: "2027-01-01" },
        ] as never}
        onClose={vi.fn()}
      />,
    );
    const options = Array.from(document.querySelectorAll("#certificate-agreements option")).map((option) => option.getAttribute("value"));
    expect(options).toEqual(["Nordvik AS (111) — 2024/1 — Skolerute", "Sørli AS (222) — 2025/2 — Avfall"]);

    fireEvent.change(screen.getByLabelText("Leverandør og avtale"), { target: { value: "Nordvik" } });
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["demo"], "certificate.pdf", { type: "application/pdf" })] },
    });
    fireEvent.submit(screen.getByRole("dialog"));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Velg et av forslagene for å fortsette.")).toBeTruthy();
  });
});
