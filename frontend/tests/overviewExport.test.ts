import { describe, expect, it } from "vitest";
import { toSemicolonCsv } from "../src/utils/csv";
import { buildOverviewRows, OVERVIEW_COLUMNS } from "../src/utils/overviewExport";
import type { DashboardSummary, RecentAlert, TopRiskSupplier } from "../src/types/dashboard";

describe("toSemicolonCsv", () => {
  const columns = ["Name", "Detail", "Value"];

  it("starts with a byte order mark, uses semicolons and CRLF", () => {
    const csv = toSemicolonCsv(columns, [{ Name: "a", Detail: "b", Value: 1 }]);
    expect(csv.startsWith("﻿Name;Detail;Value\r\n")).toBe(true);
    expect(csv).toContain("\r\na;b;1\r\n");
  });

  it("leaves missing cells empty instead of printing undefined", () => {
    const csv = toSemicolonCsv(columns, [{ Name: "only name" }]);
    expect(csv).toContain("\r\nonly name;;\r\n");
    expect(csv).not.toContain("undefined");
  });

  it("neutralises formulas and quotes cells holding a semicolon, quote or line break", () => {
    const csv = toSemicolonCsv(columns, [{ Name: "=SUM(1)", Detail: 'say "hi"; bye\nline', Value: -5 }]);
    expect(csv).toContain(`'=SUM(1);"say ""hi""; bye\nline";-5`);
  });

  it("keeps æøå", () => {
    expect(toSemicolonCsv(columns, [{ Name: "Ærlig Øksnes Åsen" }])).toContain("Ærlig Øksnes Åsen");
  });
});

const supplier = (id: string, risk: TopRiskSupplier["risk"], extra: Partial<TopRiskSupplier> = {}): TopRiskSupplier => ({
  id, displayName: `Supplier ${id}`, orgId: id, primaryContract: `2024/${id} — Route`, risk, mainIssue: `Issue ${id}`, ...extra,
});

const alert = (id: string, extra: Partial<RecentAlert> = {}): RecentAlert => ({
  id, severity: "high", title: `Alert ${id}`, description: `Description ${id}`, timeAgo: "1d", createdAt: "2026-10-01T10:00:00Z",
  status: "OPEN", category: "VEHICLE_COMPLIANCE", source: "AUTOMATIC", findingType: "CONFIRMED_DEVIATION", supplierId: "1", ...extra,
});

const summary = {
  kpis: {
    totalSuppliers: 3, highRiskSuppliers: 1, activeAlerts: 3, complianceRatePercent: 50, assessedSuppliers: 2,
    activeAgreements: 3, listedVehicles: 9, certificatesTracked: 4,
  },
  riskClassification: {
    high: { count: 1, percent: 33 }, medium: { count: 0, percent: 0 }, compliant: { count: 1, percent: 33 }, unassessed: { count: 1, percent: 33 },
  },
  topRiskSuppliers: [
    supplier("1", "high", { issueCategories: ["VEHICLE_DEVIATION", "CERTIFICATE_EXPIRY"], onboardingStatus: "UNDER_REVIEW" }),
    supplier("2", "compliant"),
    supplier("3", "unassessed"),
  ],
} as unknown as DashboardSummary;

describe("buildOverviewRows", () => {
  const alerts = [
    alert("a1", { dueDate: "2026-12-01" }),
    alert("a2", { category: "CERTIFICATES", severity: "medium" }),
    alert("a3", { status: "RESOLVED" }),
    alert("a4", { supplierId: undefined }),
  ];
  const rows = buildOverviewRows(summary, alerts);
  const section = (name: string) => rows.filter((row) => row.Section === name);

  it("lists the metrics first, including suppliers not assessed", () => {
    expect(rows[0]).toEqual({ Section: "Metric", Name: "Active suppliers", Value: 3 });
    expect(section("Metric").find((row) => row.Name === "Suppliers not assessed")?.Value).toBe(1);
    expect(rows.findIndex((row) => row.Section !== "Metric")).toBe(section("Metric").length);
  });

  it("lists each high-risk supplier with its agreement and every issue category", () => {
    expect(section("High-risk supplier")).toEqual([{
      Section: "High-risk supplier", Supplier: "Supplier 1", Agreement: "2024/1 — Route", "Risk / Severity": "High",
      Status: "under review", Category: "Vehicle deviation, Certificate expiry", Detail: "Issue 1",
    }]);
  });

  it("lists unresolved alerts only, with the supplier and agreement they belong to", () => {
    const listed = section("Unresolved alert");
    expect(listed.map((row) => row.Name)).toEqual(["Alert a1", "Alert a2", "Alert a4"]);
    expect(listed[0]).toMatchObject({ Supplier: "Supplier 1", Agreement: "2024/1 — Route", "Risk / Severity": "High", Status: "Open", Category: "Vehicle compliance", "Due date": "2026-12-01" });
    expect(listed[2].Supplier).toBeUndefined();
  });

  it("lists unresolved vehicle alerts again as deviations", () => {
    expect(section("Deviation").map((row) => row.Name)).toEqual(["Alert a1", "Alert a4"]);
  });

  it("puts the sections in order and only uses the report columns", () => {
    const order = rows.map((row) => row.Section).filter((name, index, all) => all.indexOf(name) === index);
    expect(order).toEqual(["Metric", "High-risk supplier", "Unresolved alert", "Deviation"]);
    for (const row of rows) for (const key of Object.keys(row)) expect(OVERVIEW_COLUMNS).toContain(key);
  });
});
