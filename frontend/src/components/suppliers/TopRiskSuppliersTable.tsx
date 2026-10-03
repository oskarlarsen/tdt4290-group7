import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../ui/RiskBadge";
import { StatusBadge } from "../ui/StatusBadge";
import type { TopRiskSupplier } from "../../types/dashboard";
import type { FollowUpStatus } from "../../hooks/useSupplierReviewStatus";

const REVIEW_STATUS_BADGES: Record<FollowUpStatus, { label: string; color: "yellow" | "orange" | "tertiary" }> = {
  "to-review": { label: "To Review", color: "yellow" },
  "in-progress": { label: "In Progress", color: "orange" },
  resolved: { label: "Resolved", color: "tertiary" },
};

export function TopRiskSuppliersTable({
  suppliers,
  actionLabel = "Investigate",
  onSelect,
  getReviewStatus,
  onMarkReviewComplete,
}: {
  suppliers: TopRiskSupplier[];
  actionLabel?: string;
  onSelect?: (supplier: TopRiskSupplier) => void;
  /** Optional review status used by the Suppliers page; Dashboard usage does not need it */
  getReviewStatus?: (supplierId: string) => FollowUpStatus;
  /** Optional review action used by the Dashboard attention widget, sharing the Suppliers page review status */
  onMarkReviewComplete?: (supplier: TopRiskSupplier) => void;
}) {
  const navigate = useNavigate();

  function handleSelect(supplier: TopRiskSupplier) {
    if (onSelect) onSelect(supplier);
    else navigate(`/admin/suppliers/${supplier.id}`);
  }

  if (suppliers.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-neutral-400">
        No suppliers to show.
      </div>
    );
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
            {getReviewStatus && <th className="pb-2 pr-3 font-medium">Review status</th>}
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-t border-neutral-100">
              <td className="py-3 pr-3">
                <button
                  onClick={() => handleSelect(s)}
                  className="text-left font-medium text-neutral-900 hover:text-primary-900 hover:underline"
                >
                  {s.displayName}
                </button>
                <div className="font-mono text-xs text-neutral-400">{s.orgId}</div>
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.primaryContract}</td>
              <td className="py-3 pr-3">
                <RiskBadge level={s.risk} />
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.mainIssue}</td>
              {getReviewStatus && (
                <td className="py-3 pr-3">
                  {(() => {
                    const badge = REVIEW_STATUS_BADGES[getReviewStatus(s.id)];
                    return (
                      <div className="whitespace-nowrap">
                        <StatusBadge status={badge.color} label={badge.label} />
                      </div>
                    );
                  })()}
                </td>
              )}
              <td className="py-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSelect(s)}
                    className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-primary-900 px-3 text-xs font-medium leading-none text-white hover:bg-primary-700"
                  >
                    {actionLabel}
                  </button>
                  {onMarkReviewComplete && (
                    <button
                      type="button"
                      aria-label="Mark review complete"
                      title="Mark review complete"
                      onClick={() => onMarkReviewComplete(s)}
                      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-tertiary-200 px-3 text-xs font-medium leading-none text-tertiary-700 hover:bg-tertiary-50"
                    >
                      Done
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