import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { NewManualAlertInput, RecentAlert } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO(backend): GET /admin/alerts should return real alert records with workflow statuses.
export function getAlerts(): Promise<RecentAlert[]> {
  if (USE_MOCKS) return Promise.resolve([...db.getAllAlerts()]);
  return apiFetch<RecentAlert[]>("/admin/alerts");
}

export function createManualAlert(input: NewManualAlertInput): Promise<RecentAlert> {
  if (!USE_MOCKS) {
    return Promise.reject(
      new Error("Manual alert creation is unavailable until the backend supports it.")
    );
  }
  return Promise.resolve(db.addManualAlert(input));
}

export function deleteAlert(id: string): Promise<void> {
  if (!USE_MOCKS) {
    return Promise.reject(
      new Error("Alert deletion is unavailable until the backend supports it.")
    );
  }
  db.deleteAlert(id);
  return Promise.resolve();
}