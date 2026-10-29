import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { RecentAlert } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO(backend): GET /admin/alerts should return real alert records (active and dismissed).
export function getAlerts(): Promise<RecentAlert[]> {
  if (USE_MOCKS) return Promise.resolve([...db.getAllAlerts()]);
  return apiFetch<RecentAlert[]>("/admin/alerts");
}