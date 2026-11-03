import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { NewSupplierInput, TopRiskSupplier } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO: define the real DTO shape in src/types and use it here
export function getSuppliers() {
  return apiFetch<unknown[]>("/suppliers");
}

export function createSupplier(input: NewSupplierInput): Promise<TopRiskSupplier> {
  if (!USE_MOCKS) {
    return Promise.reject(
      new Error("Adding suppliers is unavailable until supplier creation is supported by the backend.")
    );
  }
  return Promise.resolve(db.addSupplier(input));
}
