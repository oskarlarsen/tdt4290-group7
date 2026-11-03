import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCertificates, uploadCertificate } from "../api/certificates";

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificates"] }),
  });
}