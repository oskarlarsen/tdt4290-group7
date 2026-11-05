import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { NewSupplierNote, SupplierNote } from "../types/dashboard";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

/** The viewer and author are only used by the mock layer: the real server takes both from the login. */
export function getSupplierNotes(supplierId: string, viewerId: string): Promise<SupplierNote[]> {
  if (USE_MOCKS) return Promise.resolve(db.getNotesForSupplier(supplierId, viewerId));
  return apiFetch<SupplierNote[]>(`/admin/suppliers/${supplierId}/notes`);
}

export function addSupplierNote(
  supplierId: string,
  author: { id: string; name: string },
  note: NewSupplierNote
): Promise<SupplierNote> {
  if (USE_MOCKS) return Promise.resolve(db.addSupplierNote(supplierId, author, note));
  return apiFetch<SupplierNote>(`/admin/suppliers/${supplierId}/notes`, {
    method: "POST",
    body: JSON.stringify(note),
  });
}
