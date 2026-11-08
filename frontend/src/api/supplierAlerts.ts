import { apiFetch } from "./client";
import type { AlertCategory, AlertSeverity } from "../types/dashboard";

/** What a supplier sees of an alert. The admin's reason, affected item and internal statuses are not included. */
export type SupplierAlert = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  dueDate: string | null;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
};

export function getSupplierAlerts(category?: AlertCategory): Promise<SupplierAlert[]> {
  return apiFetch<SupplierAlert[]>(category ? `/supplier/alerts?category=${encodeURIComponent(category)}` : "/supplier/alerts");
}
