import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CertificateTable } from "../src/components/certificates/CertificateTable";
import type { Certificate } from "../src/types/certificate";

const certificate: Certificate = {
  id: "certificate-123",
  supplierName: "Example Transport AS",
  certificateType: "ISO 14001",
  issueDate: "2025-01-15",
  expiryDate: "2028-12-31",
  sourceFile: "environment-certificate.pdf",
  status: "VALID",
  contractId: "CONTRACT-42",
};

describe("certificate table", () => {
  it("shows certificate dates, contract reference, status, and management actions", () => {
    const html = renderToStaticMarkup(
      <CertificateTable certificates={[certificate]} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(html).toContain("Issue date");
    expect(html).toContain("Expiry date");
    expect(html).toContain("Contract reference");
    expect(html).toContain("CONTRACT-42");
    expect(html).toContain("Valid");
    expect(html).toContain(">Details</button>");
    expect(html).toContain(">Edit</button>");
    expect(html).toContain(">Delete</button>");
    expect(html).not.toContain("environment-certificate.pdf");
  });
});
