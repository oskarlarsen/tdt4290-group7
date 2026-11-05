import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type {
  AlertStatus,
  DashboardSummary,
  NewManualAlertInput,
  RecentAlert,
} from "../types/dashboard";
import type { FollowUpStatus } from "../hooks/useSupplierReviewStatus";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export function getDashboardSummary(): Promise<DashboardSummary> {
  if (USE_MOCKS) {
    const supplierSummary = db.getSupplierPortfolioSummary();
    const { riskClassification } = supplierSummary;
    return Promise.resolve({
      lastSyncedAt: db.getLastSyncedAt(),
      kpis: {
        totalSuppliers: supplierSummary.monitoredSuppliers,
        totalSuppliersDeltaThisMonth: supplierSummary.renewedThisMonthCount,
        highRiskSuppliers: riskClassification.high.count,
        monitoredSuppliers: supplierSummary.monitoredSuppliers,
        activeAlerts: db.getUnresolvedAlertsCount(),
        alertsBySeverity: db.getAlertsBySeverity(),
        complianceRatePercent: riskClassification.compliant.percent,
        complianceTargetPercent: 95,
        assessedSuppliers: supplierSummary.monitoredSuppliers,
        activeAgreements: supplierSummary.monitoredSuppliers,
        listedVehicles: 0,
        certificatesTracked: 0,
        expiredCertificates: 0,
        certificatesExpiringWithin90Days: 0,
      },
      riskClassification,
      topRiskSuppliers: db.getTopRiskSuppliers(),
      suppliersRequiringAttention: db.getSuppliersRequiringAttention(),
      issueCategoryBreakdown: db.getIssueCategoryBreakdown(),
      recentAlerts: db.getUnresolvedAlerts(),
    });
  }
  return apiFetch<DashboardSummary>("/admin/dashboard/summary");
}

export function updateAlertStatus(id: string, status: AlertStatus): Promise<void> {
  if (USE_MOCKS) {
    db.updateAlertStatus(id, status);
    return Promise.resolve();
  }
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function resyncDashboard(): Promise<{ lastSyncedAt: string }> {
  if (USE_MOCKS) return Promise.resolve({ lastSyncedAt: db.resyncNow() });
  return apiFetch<{ lastSyncedAt: string }>("/admin/dashboard/sync", { method: "POST" });
}

export function getRiskLogRows(): Promise<Array<Record<string, string>>> {
  if (USE_MOCKS) return Promise.resolve(db.getRiskLogRows());
  return apiFetch<Array<Record<string, string>>>("/admin/risk-log");
}

export function getAlerts(includeArchived = false): Promise<RecentAlert[]> {
  if (USE_MOCKS) return Promise.resolve([...db.getAllAlerts(includeArchived)]);
  return apiFetch<RecentAlert[]>(includeArchived ? "/admin/alerts?includeArchived=true" : "/admin/alerts");
}

export function createManualAlert(input: NewManualAlertInput): Promise<RecentAlert> {
  if (USE_MOCKS) return Promise.resolve(db.addManualAlert(input));
  return apiFetch<RecentAlert>("/admin/alerts", { method: "POST", body: JSON.stringify(input) });
}

export function deleteAlert(id: string): Promise<void> {
  if (USE_MOCKS) {
    db.deleteAlert(id);
    return Promise.resolve();
  }
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function archiveAlert(id: string): Promise<void> {
  if (USE_MOCKS) {
    db.archiveAlert(id);
    return Promise.resolve();
  }
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export function restoreAlert(id: string): Promise<void> {
  if (USE_MOCKS) {
    db.restoreAlert(id);
    return Promise.resolve();
  }
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export function getSupplierReviewStatuses(): Promise<Record<string, FollowUpStatus>> {
  return apiFetch<Record<string, FollowUpStatus>>("/admin/supplier-reviews");
}

export function updateSupplierReviewStatus(
  supplierId: string,
  status: FollowUpStatus,
): Promise<void> {
  return apiFetch<void>(`/admin/supplier-reviews/${encodeURIComponent(supplierId)}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}
