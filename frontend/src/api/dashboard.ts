import { apiFetch } from "./client";
import type {
  AlertContentUpdate,
  AlertStatus,
  DashboardSummary,
  NewManualAlertInput,
  RecentAlert,
} from "../types/dashboard";
import type { FollowUpStatus } from "../hooks/useSupplierReviewStatus";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/admin/dashboard/summary");
}

export function updateAlertStatus(id: string, status: AlertStatus): Promise<void> {
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateManualAlert(id: string, changes: AlertContentUpdate): Promise<RecentAlert> {
  return apiFetch<RecentAlert>(`/admin/alerts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function resyncDashboard(): Promise<{ lastSyncedAt: string }> {
  return apiFetch<{ lastSyncedAt: string }>("/admin/dashboard/sync", { method: "POST" });
}

export function getRiskLogRows(): Promise<Array<Record<string, string>>> {
  return apiFetch<Array<Record<string, string>>>("/admin/risk-log");
}

export function getAlerts(includeArchived = false): Promise<RecentAlert[]> {
  return apiFetch<RecentAlert[]>(includeArchived ? "/admin/alerts?includeArchived=true" : "/admin/alerts");
}

export function createManualAlert(input: NewManualAlertInput): Promise<RecentAlert> {
  return apiFetch<RecentAlert>("/admin/alerts", { method: "POST", body: JSON.stringify(input) });
}

export function deleteAlert(id: string): Promise<void> {
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function archiveAlert(id: string): Promise<void> {
  return apiFetch<void>(`/admin/alerts/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export function restoreAlert(id: string): Promise<void> {
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
