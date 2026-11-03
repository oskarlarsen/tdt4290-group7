import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "vite";
import config from "../vite.config";

describe("shared environment configuration", () => {
  it("uses the repository root without expanding the browser-visible prefix", () => {
    expect(config.envDir).toBe("..");
    expect(config.envPrefix).toBeUndefined();
    expect(config.define).toBeUndefined();
  });

  it("only exposes public VITE settings from a shared file", () => {
    const directory = mkdtempSync(join(tmpdir(), "vehicle-public-env-test-"));
    writeFileSync(join(directory, ".env"), [
      "VITE_API_BASE_URL=http://localhost:8080/api",
      "VITE_USE_MOCKS=false",
      "VITE_USE_MOCK_AUTH=false",
      "JWT_SECRET=synthetic-jwt-secret",
      "SEED_ADMIN_PASSWORD=synthetic-admin-password",
      "SEED_SUPPLIER_PASSWORD=synthetic-supplier-password",
      "SVV_API_KEY=synthetic-registry-key",
    ].join("\n"));
    const browserSettings = loadEnv("development", directory, "VITE_");
    expect(browserSettings).toHaveProperty("VITE_API_BASE_URL");
    expect(browserSettings).toHaveProperty("VITE_USE_MOCKS");
    expect(browserSettings).toHaveProperty("VITE_USE_MOCK_AUTH");
    for (const key of ["JWT_SECRET", "SEED_ADMIN_PASSWORD", "SEED_SUPPLIER_PASSWORD", "SVV_API_KEY"]) {
      expect(browserSettings).not.toHaveProperty(key);
    }
  });
});
