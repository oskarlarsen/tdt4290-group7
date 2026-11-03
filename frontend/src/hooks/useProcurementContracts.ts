import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProcurementContracts,
  importContractCsv,
  previewContractCsv,
} from "../api/procurement";

export function useProcurementContracts() {
  return useQuery({
    queryKey: ["procurement-contracts"],
    queryFn: getProcurementContracts,
    staleTime: 60_000,
  });
}

export function usePreviewContractCsv() {
  return useMutation({
    mutationFn: ({ supplierId, csv }: { supplierId: string; csv: string }) =>
      previewContractCsv(supplierId, csv),
  });
}

export function useImportContractCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, csv }: { supplierId: string; csv: string }) =>
      importContractCsv(supplierId, csv),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procurement-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });
}
