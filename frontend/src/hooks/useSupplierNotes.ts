import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as notesApi from "../api/notes";
import { useAuth } from "./useAuth";

export function useSupplierNotes(supplierId: string | null) {
  return useQuery({
    queryKey: ["supplier-notes", supplierId],
    queryFn: () => notesApi.getSupplierNotes(supplierId!),
    enabled: !!supplierId,
  });
}

export function useAddSupplierNote(supplierId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      notesApi.addSupplierNote(supplierId!, user?.name ?? "Unknown admin", text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supplier-notes", supplierId] }),
  });
}