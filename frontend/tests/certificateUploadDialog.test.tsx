// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateUploadDialog } from "../src/components/certificates/CertificateUploadDialog";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("../src/hooks/useCertificates", () => ({
  useUploadCertificate: () => ({ mutate, isPending: false, isError: false }),
}));

describe("certificate upload dialog", () => {
  beforeEach(() => mutate.mockClear());

  it("submits the selected supplier's contract ID with the PDF", () => {
    render(
      <CertificateUploadDialog
        contracts={[
          {
            id: "sup-a",
            name: "Example transport contract",
            reference: "CONTRACT-42",
            supplierId: "sup-a",
            supplierName: "Example Transport AS",
            supplierOrgNumber: "123456789",
            startDate: "2026-01-01",
            endDate: "2027-12-31",
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Supplier and contract"), { target: { value: "sup-a" } });
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["demo"], "certificate.pdf", { type: "application/pdf" })] },
    });
    fireEvent.submit(screen.getByRole("dialog"));

    expect(mutate).toHaveBeenCalledWith(
      {
        file: expect.any(File),
        contractId: "sup-a",
      },
      { onSuccess: expect.any(Function) },
    );
  });
});
