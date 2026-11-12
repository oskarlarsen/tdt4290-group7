import type { AlertCategory, DashboardSummary, RecentAlert, SupplierIssueCategory } from "../types/dashboard";

export const OVERVIEW_COLUMNS = [
  "Seksjon", "Leverandør", "Navn", "Avtale", "Risiko / alvorlighet", "Status", "Kategori", "Detaljer", "Frist", "Verdi",
] as const;

type Row = Partial<Record<(typeof OVERVIEW_COLUMNS)[number], string | number>>;

const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  ENVIRONMENTAL_COMPLIANCE: "Miljøoppfølging",
  ENERGY_FUEL: "Energi",
  VEHICLE_COMPLIANCE: "Kjøretøyoppfølging",
  CERTIFICATES: "Sertifikater",
};

const ALERT_STATUS_LABELS: Record<RecentAlert["status"], string> = {
  OPEN: "Åpen",
  IN_PROGRESS: "Under arbeid",
  UNDER_REVIEW: "Under vurdering",
  RESOLVED: "Løst",
};

const ISSUE_LABELS: Record<SupplierIssueCategory, string> = {
  VEHICLE_DEVIATION: "Kjøretøyavvik",
  CERTIFICATE_EXPIRY: "Sertifikatutløp",
  ENERGY_DEVIATION: "Energiavvik",
};

const ALERT_SEVERITY_LABELS: Record<RecentAlert["severity"], string> = { high: "Høy", medium: "Middels", low: "Lav" };

const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  INVITED: "Invitert", PROFILE_PENDING: "Profil venter", DATA_DRAFT: "Pågår", VALIDATING: "Validerer",
  SUBMITTED: "Innsendt", UNDER_REVIEW: "Under vurdering", APPROVED: "Godkjent", REVISION_REQUIRED: "Endringer ønskes",
};

/**
 * Rows for the one-sheet overview report: the summary metrics, then the suppliers, alerts and deviations behind them.
 * An unresolved vehicle alert is a deviation, so it is listed twice, once per section.
 */
export function buildOverviewRows(data: DashboardSummary, alerts: RecentAlert[]): Row[] {
  const { kpis, riskClassification } = data;
  const supplierById = new Map(data.topRiskSuppliers.map((supplier) => [supplier.id, supplier]));
  const metric = (name: string, value: number): Row => ({ Seksjon: "Nøkkeltall", Navn: name, Verdi: value });

  const rows: Row[] = [
    metric("Aktive leverandører", kpis.totalSuppliers),
    metric("Aktive avtaler", kpis.activeAgreements),
    metric("Kjøretøy på listen", kpis.listedVehicles),
    metric("Sertifikater under oppfølging", kpis.certificatesTracked),
    metric("Leverandører med høy risiko", kpis.highRiskSuppliers),
    metric("Uløste varsler", kpis.activeAlerts),
    metric("Leverandører uten funn (%)", kpis.complianceRatePercent),
    metric("Leverandører uten funn", riskClassification.compliant.count),
    metric("Leverandører med middels risiko", riskClassification.medium.count),
    metric("Leverandører med lav risiko", riskClassification.low.count),
    metric("Leverandører med høy risiko (klassifisering)", riskClassification.high.count),
    metric("Leverandører ikke vurdert", riskClassification.unassessed.count),
    metric("Vurderte leverandører", kpis.assessedSuppliers),
  ];

  for (const supplier of data.topRiskSuppliers.filter((s) => s.risk === "high")) {
    const categories = supplier.issueCategories ?? (supplier.issueCategory ? [supplier.issueCategory] : []);
    rows.push({
      Seksjon: "Leverandør med høy risiko",
      Leverandør: supplier.displayName,
      Avtale: supplier.primaryContract,
      "Risiko / alvorlighet": "Høy",
      Status: ONBOARDING_STATUS_LABELS[supplier.onboardingStatus ?? "INVITED"],
      Kategori: categories.map((category) => ISSUE_LABELS[category]).join(", "),
      Detaljer: supplier.mainIssue,
    });
  }

  const alertRow = (section: string, alert: RecentAlert): Row => {
    const supplier = alert.supplierId ? supplierById.get(alert.supplierId) : undefined;
    return {
      Seksjon: section,
      Leverandør: supplier?.displayName,
      Navn: alert.title,
      Avtale: supplier?.primaryContract,
      "Risiko / alvorlighet": ALERT_SEVERITY_LABELS[alert.severity],
      Status: ALERT_STATUS_LABELS[alert.status],
      Kategori: alert.category ? ALERT_CATEGORY_LABELS[alert.category] : undefined,
      Detaljer: alert.description,
      Frist: alert.dueDate,
    };
  };

  const unresolved = alerts.filter((alert) => alert.status !== "RESOLVED");
  rows.push(...unresolved.map((alert) => alertRow("Uløst varsel", alert)));
  rows.push(...unresolved.filter((alert) => alert.category === "VEHICLE_COMPLIANCE").map((alert) => alertRow("Avvik", alert)));
  return rows;
}
