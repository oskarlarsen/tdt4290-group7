import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { EnergyData } from "../types/energy";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO(backend): GET /admin/energy should return real contract requirements and
// supplier consumption statistics.
export function getEnergyData(): Promise<EnergyData> {
  if (USE_MOCKS) return Promise.resolve(db.getEnergyData());
  return apiFetch<EnergyData>("/admin/energy");
}