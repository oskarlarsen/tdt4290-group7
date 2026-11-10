// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Certificate } from "../src/types/certificate";

const workspace = vi.hoisted(() => ({ data: undefined as unknown }));
const certApi = vi.hoisted(() => ({
  uploadSupplierCertificate: vi.fn(),
  confirmCertificateArchive: vi.fn(),
  rejectCertificateArchive: vi.fn(),
}));
vi.mock("../src/api/certificates", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/api/certificates")>()), ...certApi }));
vi.mock("../src/hooks/useMySupplierOverview", () => ({
  useMySupplierOverview: () => ({ data: workspace.data, isLoading: false, isError: false, error: null }),
}));

import MyCertificates from "../src/pages/supplier/MyCertificates";
import { PendingRenewalsCard } from "../src/components/certificates/PendingRenewalsCard";
import { SupplierCertificateUploadDialog } from "../src/components/certificates/SupplierCertificateUploadDialog";

const cert = (id: string, extra: Partial<Certificate> = {}): Certificate => ({
  id, standard: "iso-14001", certificateNumber: null, contractId: "agr-1", validUntil: "2099-01-01", supplierName: "Nordvik AS", ...extra,
});
const agreements = [{ id: "agr-1", note: "Skolerute", saksnr: "2024/1" }, { id: "agr-2", note: "Avfall", saksnr: "2024/2" }];

function mount(ui: ReactElement) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("supplier My Certificates", () => {
  it("shows live certificates, a waiting label on renewals, and archived history separately", () => {
    workspace.data = {
      agreements,
      certificates: [
        cert("live"),
        cert("renewal", { archivePendingFor: "old" }),
        cert("old-archived", { archivedAt: "2026-01-01T00:00:00Z", validUntil: "2020-01-01" }),
      ],
    };
    mount(<MyCertificates />);
    expect(screen.getByText("Waiting for admin review")).toBeTruthy();
    const archived = screen.getByRole("region", { name: "Archived" });
    expect(archived.textContent).toContain("Valid until");
    expect(screen.getAllByText("ISO 14001")).toHaveLength(3); // two live cards and the archived list row
  });

  it("offers Renew only for certificates close to expiry and opens the upload for that agreement", () => {
    workspace.data = {
      agreements,
      certificates: [cert("soon", { contractId: "agr-2", validUntil: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) }), cert("fine")],
    };
    mount(<MyCertificates />);
    expect(screen.getAllByRole("button", { name: "Renew" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Renew" }));
    expect((screen.getByLabelText("Agreement") as HTMLSelectElement).value).toBe("agr-2");
  });

  it("disables upload when the supplier has no agreement", () => {
    workspace.data = { agreements: [], certificates: [] };
    mount(<MyCertificates />);
    expect((screen.getByRole("button", { name: "Upload certificate" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("supplier certificate upload dialog", () => {
  it("sends the chosen agreement and file, and shows a server error", async () => {
    const upload = certApi.uploadSupplierCertificate.mockRejectedValue(new Error("That agreement belongs to another supplier"));
    mount(<SupplierCertificateUploadDialog agreements={agreements} onClose={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Agreement"), { target: { value: "agr-1" } });
    const file = new File(["pdf"], "iso.pdf", { type: "application/pdf" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(upload).toHaveBeenCalledWith(file, "agr-1"));
    expect(await screen.findByText("That agreement belongs to another supplier")).toBeTruthy();
  });
});

describe("admin pending renewals", () => {
  const old = cert("old", { validUntil: "2026-03-01" });
  const renewal = cert("renewal", { validUntil: "2028-03-01", archivePendingFor: "old", uploadedByRole: "SUPPLIER" });

  it("renders nothing without pending renewals", () => {
    const { container } = mount(<PendingRenewalsCard certificates={[old]} />);
    expect(container.textContent).toBe("");
  });

  it("confirms or rejects a renewal", async () => {
    const confirm = certApi.confirmCertificateArchive.mockResolvedValue(undefined);
    const reject = certApi.rejectCertificateArchive.mockResolvedValue(undefined);
    mount(<PendingRenewalsCard certificates={[old, renewal]} />);
    expect(screen.getByText("Renewals waiting for review (1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm renewal for Nordvik AS" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("renewal"));
    fireEvent.click(screen.getByRole("button", { name: "Reject renewal for Nordvik AS" }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith("renewal"));
  });
});
