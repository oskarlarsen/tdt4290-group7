import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { DerivedContract } from "../types/contract";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO: Replace derived contract data with real Contract records from the backend.
export function getContracts(): Promise<DerivedContract[]> {
  if (USE_MOCKS) return Promise.resolve(db.getDerivedContracts());
  return apiFetch<DerivedContract[]>("/admin/contracts");
}