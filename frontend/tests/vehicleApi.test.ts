import { afterEach, describe, expect, it, vi } from "vitest";
import { appendStatistics, getCheck, getFleet, getStatistics, runCheck, saveAgreement } from "../src/api/vehicles";

afterEach(() => vi.unstubAllGlobals());
describe("real vehicle API client", () => {
  it("uses GET for browsing, includes credentials, encodes filters and preserves decimals", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"total":1,"items":[{"estimatedCo2Kg":123.456789012345678}]}'));
    vi.stubGlobal("fetch", fetch);
    const result = await getFleet();
    expect(fetch.mock.calls[0][0]).toContain("/vehicle-fleet");
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
    expect(result.total).toBe(1);
    expect((result.items[0] as unknown as { estimatedCo2Kg: string }).estimatedCo2Kg).toBe("123.456789012345678");
    fetch.mockResolvedValue(new Response("{}"));
    await getCheck("synthetic-id");
    expect(fetch.mock.calls[1][0]).toContain("/vehicle-checks/synthetic-id");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("sends one statistics POST without duplicating the backend's automatic check", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetch);
    const body = '{"rows":[{"registrationNumber":"AB10001","totalTripKm":1.23456789012345678}]}';
    await appendStatistics(body);
    expect(fetch.mock.calls[0][1].body).toBe(body);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    fetch.mockResolvedValue(new Response("{}"));
    await runCheck("AB10001", true);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ registrationNumber: "AB10001", forceRefresh: true });
  });
  it("uses a paginated GET for the statistics directory without running checks", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"items":[],"total":0,"page":2,"pageSize":25}')); vi.stubGlobal("fetch", fetch);
    await getStatistics("AB10001", 2);
    expect(fetch.mock.calls[0][0]).toContain("/trip-rows?search=AB10001&page=2&pageSize=25");
    expect(fetch.mock.calls[0][1].method).toBeUndefined(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("sends only the supplier agreement fields", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetch);
    const agreement = { supplierId: "supplier", startDate: "2026-01-01", endDate: "2026-12-31", allowedVehicles: 5, note: "" };
    await saveAgreement(agreement);
    expect(fetch.mock.calls[0][0]).toContain("/vehicle-fleet/agreements");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(agreement);
  });
  it("shows the backend vehicle error and does not retry a failed write", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"Synthetic validation error"}', { status: 400 })); vi.stubGlobal("fetch", fetch);
    await expect(appendStatistics("{}")).rejects.toThrow("Synthetic validation error");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
