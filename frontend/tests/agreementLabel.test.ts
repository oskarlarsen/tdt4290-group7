import { describe, expect, it } from "vitest";
import { agreementLabel, hasSaksnr } from "../src/utils/agreementLabel";

describe("agreementLabel", () => {
  it("joins saksnr and note", () => {
    expect(agreementLabel({ saksnr: "2024/1234", note: " Skolerute " })).toBe("2024/1234 — Skolerute");
  });
  it("uses the saksnr alone when there is no note", () => {
    expect(agreementLabel({ saksnr: "2024/1234", note: "" })).toBe("2024/1234");
  });
  it("marks agreements without a saksnr", () => {
    expect(agreementLabel({ saksnr: null, note: "Skolerute" })).toBe("Saksnr mangler — Skolerute");
    expect(agreementLabel({ saksnr: "  ", note: "" })).toBe("Saksnr mangler");
    expect(hasSaksnr({ saksnr: "  " })).toBe(false);
    expect(hasSaksnr({ saksnr: "2024/1" })).toBe(true);
  });
});
