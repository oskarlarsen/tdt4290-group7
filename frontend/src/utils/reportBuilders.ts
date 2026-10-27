import { getEnvironmentalComplianceLabel } from "../types/contract";
import { CERTIFICATE_STANDARD_LABELS, getCertificateStatus } from "../types/certificate";
import { analyzeEnergy, getTotalKwh } from "../types/energy";
import { RISK_PRIORITY_INFO } from "../types/riskOutlook";
import type { VehicleDetails } from "../types/vehicle";
import { checkLabel } from "./vehicle";
import type { Certificate } from "../types/certificate";
import type { DerivedContract } from "../types/contract";
import type { RecentAlert, TopRiskSupplier } from "../types/dashboard";
import type { EnergyData } from "../types/energy";
import type { ReportId, ReportRow } from "../types/report";
import type { RiskOutlookRow } from "../types/riskOutlook";

export type ReportSources = {
  suppliers: TopRiskSupplier[];
  contracts: DerivedContract[];
  vehicles: VehicleDetails[];
  certificates: Certificate[];
  energy: EnergyData;
  riskOutlook: RiskOutlookRow[];
  alerts: RecentAlert[];
};

const SEVERITY_LABELS = { high: "High", medium: "Medium" } as const;
const ALERT_STATUS_LABELS = { ACTIVE: "Active", DISMISSED: "Dismissed" } as const;

// Pure functions: the same records the pages show, flattened into CSV rows.
// Nothing here is invented; an empty source simply gives an empty report.
export function buildReportRows(id: ReportId, sources: ReportSources): ReportRow[] {
  const contractById = new Map(sources.contracts.map((c) => [c.id, c]));

  switch (id) {
    case "suppliers":
      return sources.suppliers.map((s) => ({
        Supplier: s.displayName,
        "Org ID": s.orgId,
        Contract: s.primaryContract,
        Risk: s.risk.toUpperCase(),
        "Main issue": s.mainIssue,
      }));

    case "contracts":
      return sources.contracts.map((c) => ({
        Contract: c.contractName,
        Supplier: c.supplierName,
        "Org ID": c.supplierOrgId,
        "Contract status": c.status,
        "Start date": c.startDate,
        "End date": c.endDate,
        "Environmental compliance": getEnvironmentalComplianceLabel(c.risk),
      }));

    case "vehicles":
      return sources.vehicles.map((overview) => {
        const { vehicle, agreement, latestCheck } = overview;
        return {
          "Registration number": vehicle.registrationNumber,
          "Supplier ID": agreement?.supplier.id ?? "",
          "Agreement start": agreement?.agreement.startDate ?? "",
          "Agreement end": agreement?.agreement.endDate ?? "",
          "Latest check": checkLabel(latestCheck),
          "Recorded deviations": latestCheck?.deviations.join("; ") ?? "",
        };
      });

    case "certificates":
      return sources.certificates.map((certificate) => {
        const contract = contractById.get(certificate.contractId);
        return {
          Supplier: contract?.supplierName ?? "",
          "Org ID": contract?.supplierOrgId ?? "",
          Contract: contract?.contractName ?? "",
          Standard: CERTIFICATE_STANDARD_LABELS[certificate.standard],
          "Certificate number": certificate.certificateNumber ?? "",
          "Valid until": certificate.validUntil ?? "",
          Status: getCertificateStatus(certificate).label,
        };
      });

    case "energy": {
      const requirementByContract = new Map(
        sources.energy.requirements.map((r) => [r.contractId, r])
      );
      return sources.energy.records.flatMap<ReportRow>((record) => {
        const requirement = requirementByContract.get(record.contractId);
        // Same rule as the Energy page: no requirement or no consumption means no row.
        if (!requirement || getTotalKwh(record.consumptionKwh) <= 0) return [];
        const analysis = analyzeEnergy(record, requirement);
        const contract = contractById.get(record.contractId);
        return [
          {
            Supplier: contract?.supplierName ?? "",
            "Org ID": contract?.supplierOrgId ?? "",
            Contract: contract?.contractName ?? "",
            Period: record.period,
            "Electric (kWh)": record.consumptionKwh.electric,
            "Biogas (kWh)": record.consumptionKwh.biogas,
            "Fossil (kWh)": record.consumptionKwh.fossil,
            "Total (kWh)": analysis.totalKwh,
            "Renewable share (%)": Number(analysis.renewableSharePercent.toFixed(1)),
            "Minimum renewable share (%)": requirement.minRenewableSharePercent,
            Status: analysis.label,
          },
        ];
      });
    }

    case "risk-outlook":
      return sources.riskOutlook.map((row) => ({
        Supplier: row.contract.supplierName,
        "Org ID": row.contract.supplierOrgId,
        Contract: row.contract.contractName,
        "Risk priority": RISK_PRIORITY_INFO[row.priority].label,
        "Primary risk driver": row.primary?.title ?? "",
        "Driver detail": row.primary?.detail ?? "",
        Indicators: row.indicators.length,
        "Next projected breach": row.nextProjected?.date ?? "",
        "Days until": row.nextProjected?.daysUntil ?? "",
      }));

    case "alerts": {
      const contractBySupplier = new Map<string, DerivedContract>();
      for (const c of sources.contracts) {
        if (!contractBySupplier.has(c.supplierId)) contractBySupplier.set(c.supplierId, c);
      }
      return sources.alerts.map((alert) => {
        const contract = alert.supplierId ? contractBySupplier.get(alert.supplierId) : undefined;
        return {
          Severity: SEVERITY_LABELS[alert.severity],
          Raised: alert.timeAgo,
          Alert: alert.title,
          Description: alert.description,
          Supplier: contract?.supplierName ?? "",
          "Org ID": contract?.supplierOrgId ?? "",
          Contract: contract?.contractName ?? "",
          Status: ALERT_STATUS_LABELS[alert.status],
          "Dismissed by": alert.dismissedBy ?? "",
          "Dismissed at": alert.dismissedAt ?? "",
        };
      });
    }
  }
}
