import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { SupplierNote } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export function getSupplierNotes(supplierId: string): Promise<SupplierNote[]> {
  if (USE_MOCKS) return Promise.resolve(db.getNotesForSupplier(supplierId));
  return apiFetch<SupplierNote[]>(`/admin/suppliers/${supplierId}/notes`);
}

export function addSupplierNote(
  supplierId: string,
  authorName: string,
  text: string
): Promise<SupplierNote> {
  if (USE_MOCKS) return Promise.resolve(db.addSupplierNote(supplierId, authorName, text));
  return apiFetch<SupplierNote>(`/admin/suppliers/${supplierId}/notes`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}