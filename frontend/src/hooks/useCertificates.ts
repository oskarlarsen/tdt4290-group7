import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveCertificate,
  confirmCertificateArchive,
  getCertificates,
  rejectCertificateArchive,
  uploadSupplierCertificate,
  restoreCertificate,
  updateCertificate,
  uploadCertificate,
  type CertificateUpdate,
} from "../api/certificates";

export function useCertificates(includeArchived = false) {
  return useQuery({
    queryKey: includeArchived ? ["certificates", "with-archived"] : ["certificates"],
    queryFn: () => getCertificates(includeArchived),
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

export function useUpdateCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: CertificateUpdate }) =>
      updateCertificate(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["certificates"] }),
  });
}

// Archiving and restoring change which alerts exist, so the dashboard data is refreshed too.
function useArchiveChange(mutationFn: (id: string) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutationFn(id),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["certificates"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
    ]),
  });
}

export function useArchiveCertificate() { return useArchiveChange(archiveCertificate); }
export function useRestoreCertificate() { return useArchiveChange(restoreCertificate); }
export function useConfirmCertificateArchive() { return useArchiveChange(confirmCertificateArchive); }
export function useRejectCertificateArchive() { return useArchiveChange(rejectCertificateArchive); }

export function useUploadSupplierCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, contractId }: { file: File; contractId: string }) => uploadSupplierCertificate(file, contractId),
    // The supplier's workspace holds their certificates, so it is refreshed along with the admin lists.
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["supplier-workspace"] }),
      queryClient.invalidateQueries({ queryKey: ["certificates"] }),
    ]),
  });
}
