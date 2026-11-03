import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { AlertStatus, DashboardSummary } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO: Replace mock data with the dashboard summary endpoint when available
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
  return Promise.reject(new Error("Alert status updates are not supported by the backend yet."));
}

export function resyncDashboard(): Promise<{ lastSyncedAt: string }> {
  if (USE_MOCKS) {
    return Promise.resolve({ lastSyncedAt: db.resyncNow() });
  }
  return apiFetch<{ lastSyncedAt: string }>("/admin/dashboard/sync", { method: "POST" });
}

export function getRiskLogRows() {
  if (USE_MOCKS) return Promise.resolve(db.getRiskLogRows());
  // TODO: Use paginated data when the real risk log endpoint is available
  return apiFetch<ReturnType<typeof db.getRiskLogRows>>("/admin/risk-log");
}