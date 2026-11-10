import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("supplier portal API", () => {
  it("loads certificates from the authenticated supplier endpoint without a client-selected tenant", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{
          id: "certificate-1",
          supplierName: "Example Transport AS",
          certificateType: "Miljøfyrtårn",
          issueDate: "2025-01-15",
          expiryDate: "2028-12-31",
          sourceFile: "certificate.pdf",
          status: "VALID",
          contractId: "agreement-1",
        }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { getSupplierCertificates } = await import("../src/api/onboarding");

    await expect(getSupplierCertificates()).resolves.toMatchObject([
      { id: "certificate-1", standard: "miljofyrtarn", contractId: "agreement-1" },
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/supplier/certificates");
    expect(url).not.toContain("supplierId");
    expect(options.credentials).toBe("include");
  });
});
