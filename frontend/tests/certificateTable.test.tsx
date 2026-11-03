// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CertificateTable } from "../src/components/certificates/CertificateTable";
import type { Certificate } from "../src/types/certificate";

const certificate: Certificate = {
  id: "certificate-123",
  standard: "iso-14001",
  certificateNumber: null,
  supplierName: "Example Transport AS",
  certificateType: "ISO 14001",
  contractId: "CONTRACT-42",
  issueDate: "2025-01-15",
  validUntil: "2099-12-31",
  sourceFile: "environment-certificate.pdf",
};

describe("certificate table", () => {
  it("keeps the dashboard row and exposes view, edit, and delete actions", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <CertificateTable
        rows={[{ certificate }]}
        onSelect={onSelect}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("Example Transport AS")).toBeTruthy();
    expect(screen.getByText("ISO 14001")).toBeTruthy();
    expect(screen.getByText("Not linked")).toBeTruthy();
    expect(screen.getByText("Valid")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Example Transport AS" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Example Transport AS" }));

    expect(onSelect).toHaveBeenCalledWith({ certificate, contract: undefined });
    expect(onEdit).toHaveBeenCalledWith(certificate);
    expect(onDelete).toHaveBeenCalledWith(certificate);
  });
});
