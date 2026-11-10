import { apiFetch } from "./client";
import type { NewSupplierNote, SupplierNote } from "../types/dashboard";

/** The server takes the viewer and the author from the login. */
export function getSupplierNotes(supplierId: string, viewerId: string): Promise<SupplierNote[]> {
  return apiFetch<SupplierNote[]>(`/admin/suppliers/${supplierId}/notes`);
}

export function addSupplierNote(
  supplierId: string,
  author: { id: string; name: string },
  note: NewSupplierNote
): Promise<SupplierNote> {
  return apiFetch<SupplierNote>(`/admin/suppliers/${supplierId}/notes`, {
    method: "POST",
    body: JSON.stringify(note),
  });
}
