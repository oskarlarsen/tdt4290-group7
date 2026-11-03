import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("certificate API", () => {
  it("uploads a PDF with multipart form data and maps the extracted metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "certificate-1",
          supplierName: "Example Transport AS",
          certificateType: "ISO 14001",
          issueDate: "2025-01-15",
          expiryDate: "2028-12-31",
          sourceFile: "iso-14001.pdf",
          status: "VALID",
          contractId: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { uploadCertificate } = await import("../src/api/certificates");

    const uploaded = await uploadCertificate(
      new File(["pdf"], "iso-14001.pdf", { type: "application/pdf" }),
      "Example Transport AS",
      "sup-a",
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain("/certificates");
    expect(options.credentials).toBe("include");
    expect(options.body).toBeInstanceOf(FormData);
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
    expect(options.body.get("contractId")).toBe("sup-a");
    expect(uploaded).toMatchObject({
      id: "certificate-1",
      supplierName: "Example Transport AS",
      standard: "iso-14001",
      validUntil: "2028-12-31",
      issueDate: "2025-01-15",
      contractId: "",
      sourceFile: "iso-14001.pdf",
    });
  });
});
