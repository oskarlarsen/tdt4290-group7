import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteCertificate,
  getCertificates,
  updateCertificate,
  uploadCertificate,
  type CertificateUpdate,
} from "../api/certificates";

export function useCertificates() {
  return useQuery({
    queryKey: ["certificates"],
    queryFn: getCertificates,
    staleTime: 60_000,
  });
}

export function useUploadCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, supplierName, contractId }: { file: File; supplierName: string; contractId: string }) =>
      uploadCertificate(file, supplierName, contractId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-overview"] });
    }
  });
}

export function useUpdateCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CertificateUpdate }) =>
      updateCertificate(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificates"] }),
  });
}

export function useDeleteCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCertificate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificates"] }),
  });
}