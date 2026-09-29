import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../ui/RiskBadge";
import { StatusBadge } from "../ui/StatusBadge";
import type { TopRiskSupplier } from "../../types/dashboard";

type FollowUpStatus = "to-review" | "in-progress" | "resolved";

const FOLLOW_UP_STORAGE_KEY = "supplier_issue_follow_up_statuses";
const FOLLOW_UP_BADGES: Record<FollowUpStatus, { label: string; color: "yellow" | "orange" | "tertiary" }> = {
  "to-review": { label: "To Review", color: "yellow" },
  "in-progress": { label: "In Progress", color: "orange" },
  resolved: { label: "Resolved", color: "tertiary" },
};

function isFollowUpStatus(value: unknown): value is FollowUpStatus {
  return value === "to-review" || value === "in-progress" || value === "resolved";
}

function readFollowUpStatuses(): Record<string, FollowUpStatus> {
  try {
    const stored = localStorage.getItem(FOLLOW_UP_STORAGE_KEY);
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, FollowUpStatus] =>
        isFollowUpStatus(entry[1])
      )
    );
  } catch {
    return {};
  }
}

export function TopRiskSuppliersTable({ suppliers }: { suppliers: TopRiskSupplier[] }) {
  const navigate = useNavigate();
  const [followUpStatuses, setFollowUpStatuses] = useState(readFollowUpStatuses);

  useEffect(() => {
    try {
      localStorage.setItem(FOLLOW_UP_STORAGE_KEY, JSON.stringify(followUpStatuses));
    } catch {
      // Keep the dashboard usable when browser storage is unavailable.
    }
  }, [followUpStatuses]);

  function advanceFollowUpStatus(supplierId: string, status: FollowUpStatus) {
    setFollowUpStatuses((current) => ({ ...current, [supplierId]: status }));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-400">
            <th className="pb-2 pr-3 font-medium">Supplier &amp; org ID</th>
            <th className="pb-2 pr-3 font-medium">Primary contract</th>
            <th className="pb-2 pr-3 font-medium">Risk</th>
            <th className="pb-2 pr-3 font-medium">Main issue</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-t border-neutral-100">
              <td className="py-3 pr-3">
                <div className="font-medium text-neutral-900">{s.displayName}</div>
                <div className="font-mono text-xs text-neutral-400">{s.orgId}</div>
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.primaryContract}</td>
              <td className="py-3 pr-3">
                <RiskBadge level={s.risk} />
              </td>
              <td className="py-3 pr-3 text-neutral-700">
                <div>{s.mainIssue}</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge
                    status={FOLLOW_UP_BADGES[followUpStatuses[s.id] ?? "to-review"].color}
                    label={FOLLOW_UP_BADGES[followUpStatuses[s.id] ?? "to-review"].label}
                  />
                  {followUpStatuses[s.id] === "in-progress" && (
                    <span className="text-xs text-neutral-500">Assigned to You</span>
                  )}
                </div>
              </td>
              <td className="py-3">
                <div className="flex flex-col items-start gap-2">
                  <button
                    // TODO: Connect this route when the Supplier Details page is implemented
                    onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                    className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                  >
                    Investigate
                  </button>
                  {(followUpStatuses[s.id] ?? "to-review") === "to-review" && (
                    <button
                      onClick={() => advanceFollowUpStatus(s.id, "in-progress")}
                      className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Start Review
                    </button>
                  )}
                  {followUpStatuses[s.id] === "in-progress" && (
                    <button
                      onClick={() => advanceFollowUpStatus(s.id, "resolved")}
                      className="rounded-lg border border-tertiary-200 px-2.5 py-1.5 text-xs font-medium text-tertiary-700 hover:bg-tertiary-50"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}