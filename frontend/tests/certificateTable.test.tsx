// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(cleanup);

describe("certificate table", () => {
  it("keeps the dashboard row and exposes view, edit, and archive actions", () => {
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    const onRestore = vi.fn();
    render(
      <CertificateTable
        rows={[{ certificate }]}
        onSelect={onSelect}
        onEdit={onEdit}
        onArchive={onArchive}
        onRestore={onRestore}
      />,
    );

    expect(screen.getByText("Example Transport AS")).toBeTruthy();
    expect(screen.getByText("ISO 14001")).toBeTruthy();
    expect(screen.getByText("Ikke tilknyttet")).toBeTruthy();
    expect(screen.getByText("Gyldig")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Vis detaljer" }));
    fireEvent.click(screen.getByRole("button", { name: "Rediger Example Transport AS" }));
    fireEvent.click(screen.getByRole("button", { name: "Arkiver Example Transport AS" }));

    expect(onSelect).toHaveBeenCalledWith({ certificate, contract: undefined });
    expect(onEdit).toHaveBeenCalledWith(certificate);
    expect(onArchive).toHaveBeenCalledWith(certificate);
    expect(screen.queryByRole("button", { name: /^Slett/ })).toBeNull();
  });

  it("offers Restore instead of Archive for an archived certificate", () => {
    const onArchive = vi.fn();
    const onRestore = vi.fn();
    const archived = { ...certificate, archivedAt: "2026-10-01T10:00:00Z" };
    render(<CertificateTable rows={[{ certificate: archived }]} onSelect={vi.fn()} onEdit={vi.fn()} onArchive={onArchive} onRestore={onRestore} />);

    expect(screen.queryByRole("button", { name: "Arkiver Example Transport AS" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gjenopprett Example Transport AS" }));
    expect(onRestore).toHaveBeenCalledWith(archived);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("offers Renew only on live certificates that are expiring or expired", () => {
    const onRenew = vi.fn();
    const expired = { ...certificate, id: "old", validUntil: "2020-01-01" };
    render(
      <CertificateTable
        rows={[{ certificate }, { certificate: expired }, { certificate: { ...expired, id: "gone", archivedAt: "2026-10-01T10:00:00Z" } }]}
        onSelect={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()} onRestore={vi.fn()} onRenew={onRenew}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: /^Forny/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onRenew).toHaveBeenCalledWith(expired);
  });
});
