import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as dashboardApi from "../api/dashboard";

export type FollowUpStatus = "to-review" | "in-progress" | "resolved";

// The admin's triage label is stored by the server, separately from supplier risk data
export function useSupplierReviewStatus() {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusesQuery = useQuery({
    queryKey: ["supplier-review-statuses"],
    queryFn: dashboardApi.getSupplierReviewStatuses,
  });
  const updateStatus = useMutation({
    mutationFn: ({ supplierId, status }: { supplierId: string; status: FollowUpStatus }) =>
      dashboardApi.updateSupplierReviewStatus(supplierId, status),
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["supplier-review-statuses"] });
    },
    onError: (error) =>
      setErrorMessage(error instanceof Error ? error.message : "Kunne ikke lagre vurderingsstatus for leverandøren"),
  });

  return {
    getStatus: (supplierId: string): FollowUpStatus => statusesQuery.data?.[supplierId] ?? "to-review",
    setStatus: (supplierId: string, status: FollowUpStatus) => {
      setErrorMessage(null);
      updateStatus.mutate({ supplierId, status });
    },
    errorMessage,
  };
}
