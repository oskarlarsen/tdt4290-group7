import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as noticesApi from "../api/notices";

export function useSupplierNotices(supplierId: string | null) {
  return useQuery({
    queryKey: ["supplier-notices", supplierId],
    queryFn: () => noticesApi.getSupplierNotices(supplierId!),
    enabled: !!supplierId,
  });
}

export function useSendSupplierNotice(supplierId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ title, message }: { title: string; message: string }) =>
      noticesApi.addSupplierNotice(supplierId!, title, message),
    onSuccess: () => {
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ["supplier-notices", supplierId] });
      }
    },
  });
}

export function useMarkNoticeAsRead(supplierId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noticeId: string) => noticesApi.markSupplierNoticeAsRead(noticeId),
    onSuccess: () => {
      if (supplierId) {
        queryClient.invalidateQueries({ queryKey: ["supplier-notices", supplierId] });
      }
    },
  });
}
