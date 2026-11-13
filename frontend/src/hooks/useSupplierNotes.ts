import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notesApi from "../api/notes";
import type { NewSupplierNote } from "../types/dashboard";
import { useAuth } from "./useAuth";

export function useSupplierNotes(supplierId: string | null) {
  const { user } = useAuth();
  const viewerId = user?.id ?? "";
  return useQuery({
    queryKey: ["supplier-notes", supplierId, viewerId],
    queryFn: () => notesApi.getSupplierNotes(supplierId!, viewerId),
    enabled: !!supplierId,
  });
}

export function useAddSupplierNote(supplierId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: NewSupplierNote) =>
      notesApi.addSupplierNote(supplierId!, { id: user?.id ?? "", name: user?.name ?? "Ukjent administrator" }, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-notes", supplierId] }),
  });
}
