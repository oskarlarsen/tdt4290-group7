import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as dashboardApi from "../api/dashboard";

export type FollowUpStatus = "to-review" | "in-progress" | "resolved";

const STORAGE_KEY = "supplier_issue_review_statuses";

function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return value === "to-review" || value === "in-progress" || value === "resolved";
}

function readStatuses(): Record<string, FollowUpStatus> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, FollowUpStatus] => isFollowUpStatus(e[1]))
    );
  } catch {
    return {};
  }
}

// Store the admin's local triage label separately from supplier risk data
export function useSupplierReviewStatus() {
  const mocksEnabled = import.meta.env.VITE_USE_MOCKS === "true";
  const queryClient = useQueryClient();
  const [mockStatuses, setMockStatuses] = useState(readStatuses);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusesQuery = useQuery({
    queryKey: ["supplier-review-statuses"],
    queryFn: dashboardApi.getSupplierReviewStatuses,
    enabled: !mocksEnabled,
  });
  const updateStatus = useMutation({
    mutationFn: ({ supplierId, status }: { supplierId: string; status: FollowUpStatus }) =>
      dashboardApi.updateSupplierReviewStatus(supplierId, status),
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["supplier-review-statuses"] });
    },
    onError: (error) =>
      setErrorMessage(error instanceof Error ? error.message : "Could not save supplier review status"),
  });

  useEffect(() => {
    if (!mocksEnabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockStatuses));
    } catch {
      setErrorMessage("Could not save supplier review status in this browser.");
    }
  }, [mocksEnabled, mockStatuses]);

  return {
    getStatus: (supplierId: string): FollowUpStatus =>
      (mocksEnabled ? mockStatuses[supplierId] : statusesQuery.data?.[supplierId]) ?? "to-review",
    setStatus: (supplierId: string, status: FollowUpStatus) => {
      setErrorMessage(null);
      if (mocksEnabled) {
        setMockStatuses((current) => ({ ...current, [supplierId]: status }));
      } else {
        updateStatus.mutate({ supplierId, status });
      }
    },
    errorMessage,
  };
}