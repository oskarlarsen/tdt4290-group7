import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("certificate API", () => {
  it("always reads certificates from the backend instead of fixture data", async () => {
    vi.stubEnv("VITE_USE_MOCKS", "true");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{
          id: "certificate-1",
          supplierName: "Example Transport AS",
          certificateType: "ISO 14001",
          issueDate: "2025-01-15",
          expiryDate: "2028-12-31",
          sourceFile: "iso-14001.pdf",
          contractId: "agreement-1",
        }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { getCertificates } = await import("../src/api/certificates");

    await expect(getCertificates()).resolves.toMatchObject([
      { id: "certificate-1", standard: "iso-14001", validUntil: "2028-12-31" },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toContain("/certificates");
  });

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

  it("updates and deletes certificate metadata through the API", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "certificate-1",
            supplierName: "Updated Transport AS",
            certificateType: "ISO 14001",
            issueDate: "2025-01-15",
            expiryDate: "2028-12-31",
            sourceFile: "iso-14001.pdf",
            status: "VALID",
            contractId: "CONTRACT-42",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const { deleteCertificate, updateCertificate } = await import("../src/api/certificates");

    const updated = await updateCertificate("certificate-1", {
      supplierName: "Updated Transport AS",
      certificateType: "ISO 14001",
      issueDate: "2025-01-15",
      expiryDate: "2028-12-31",
      contractId: "CONTRACT-42",
    });
    await deleteCertificate("certificate-1");

    expect(fetch.mock.calls[0][0]).toContain("/certificates/certificate-1");
    expect(fetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({
      supplierName: "Updated Transport AS",
      contractId: "CONTRACT-42",
    });
    expect(updated).toMatchObject({ supplierName: "Updated Transport AS", validUntil: "2028-12-31" });
    expect(fetch.mock.calls[1][1].method).toBe("DELETE");
  });
});
