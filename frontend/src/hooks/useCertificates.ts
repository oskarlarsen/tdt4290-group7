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
    mutationFn: ({ file, contractId }: { file: File; contractId: string }) =>
      uploadCertificate(file, contractId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificates"] }),
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