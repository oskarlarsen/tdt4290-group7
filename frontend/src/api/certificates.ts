import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { Certificate } from "../types/certificate";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// TODO(backend): GET /admin/certificates should return real per-contract
// certificate records (Mercell attachments + certification-body registries).
export function getCertificates(): Promise<Certificate[]> {
  if (USE_MOCKS) return Promise.resolve(db.getCertificates());
  return apiFetch<Certificate[]>("/admin/certificates");
}