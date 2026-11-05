import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("neutralizes text that spreadsheets would run as a formula", () => {
    const csv = toCsv([{ name: '=HYPERLINK("http://evil")', other: "+1", at: "@SUM(A1)", dash: "-2" }]);
    expect(csv.split("\n")[1]).toBe(`"'=HYPERLINK(""http://evil"")",'+1,'@SUM(A1),'-2`);
  });

  it("leaves numbers and ordinary text alone", () => {
    expect(toCsv([{ a: -5, b: "plain", c: "a,b" }]).split("\n")[1]).toBe('-5,plain,"a,b"');
  });
});
