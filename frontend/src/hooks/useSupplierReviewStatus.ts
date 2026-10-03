import { useEffect, useState } from "react";

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
  const [statuses, setStatuses] = useState(readStatuses);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
    } catch {
      // Keep the page usable if storage is unavailable.
    }
  }, [statuses]);

  return {
    getStatus: (supplierId: string): FollowUpStatus => statuses[supplierId] ?? "to-review",
    setStatus: (supplierId: string, status: FollowUpStatus) =>
      setStatuses((current) => ({ ...current, [supplierId]: status })),
  };
}