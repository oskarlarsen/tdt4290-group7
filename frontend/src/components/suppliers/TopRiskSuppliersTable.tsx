import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../ui/RiskBadge";
import { StatusBadge } from "../ui/StatusBadge";
import type { TopRiskSupplier } from "../../types/dashboard";
import type { FollowUpStatus } from "../../hooks/useSupplierReviewStatus";

const REVIEW_STATUS_BADGES: Record<FollowUpStatus, { label: string; color: "yellow" | "orange" | "tertiary" }> = {
  "to-review": { label: "Til vurdering", color: "yellow" },
  "in-progress": { label: "Under arbeid", color: "orange" },
  resolved: { label: "Løst", color: "tertiary" },
};

const ONBOARDING_STATUS_LABELS: Record<string, string> = { INVITED: "Invitert", PROFILE_PENDING: "Profil venter", DATA_DRAFT: "Pågår", VALIDATING: "Validerer", SUBMITTED: "Innsendt", UNDER_REVIEW: "Under vurdering", APPROVED: "Godkjent", REVISION_REQUIRED: "Endringer ønskes" };

export type SupplierSortKey = "supplier" | "risk";
export type SupplierSortDirection = "asc" | "desc";

function SortHeader({ label, sortKey, sort, onSort }: {
  label: string;
  sortKey: SupplierSortKey;
  sort: { key: SupplierSortKey; direction: SupplierSortDirection };
  onSort: (key: SupplierSortKey) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className="pb-2 pr-3 font-medium">
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-mono uppercase tracking-wide hover:text-neutral-900">
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-neutral-900" : "text-neutral-400"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

export function TopRiskSuppliersTable({
  sort,
  onSort,
  suppliers,
  actionLabel = "Undersøk",
  onSelect,
  getReviewStatus,
  showOnboardingStatus = false,
  onMarkReviewComplete,
}: {
  /** Optional: makes the Supplier and Risk headers sortable (Suppliers page). */
  sort?: { key: SupplierSortKey; direction: SupplierSortDirection };
  onSort?: (key: SupplierSortKey) => void;
  suppliers: TopRiskSupplier[];
  actionLabel?: string;
  onSelect?: (supplier: TopRiskSupplier) => void;
  /** Optional review status used by the Suppliers page; Dashboard usage does not need it */
  getReviewStatus?: (supplierId: string) => FollowUpStatus;
  showOnboardingStatus?: boolean;
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
      <div className="py-8 text-center text-sm text-neutral-500">
        Ingen leverandører å vise.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-500">
            {sort && onSort ? <SortHeader label="Leverandør og org.-ID" sortKey="supplier" sort={sort} onSort={onSort} /> : <th scope="col" className="pb-2 pr-3 font-medium">Leverandør og org.-ID</th>}
            <th scope="col" className="pb-2 pr-3 font-medium">Hovedavtale</th>
            {sort && onSort ? <SortHeader label="Risiko" sortKey="risk" sort={sort} onSort={onSort} /> : <th scope="col" className="pb-2 pr-3 font-medium">Risiko</th>}
            <th scope="col" className="pb-2 pr-3 font-medium">Hovedproblem</th>
            {showOnboardingStatus && <th scope="col" className="pb-2 pr-3 font-medium">Registrering</th>}
            {getReviewStatus && <th scope="col" className="pb-2 pr-3 font-medium">Vurderingsstatus</th>}
            <th scope="col" className="pb-2 font-medium">Handling</th>
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
                <div className="font-mono text-xs text-neutral-500">{s.orgId}</div>
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.primaryContract}</td>
              <td className="py-3 pr-3">
                <RiskBadge level={s.risk} />
                {sort && s.riskScore ? <div className="mt-0.5 font-mono text-xs text-neutral-500">poengsum {s.riskScore}</div> : null}
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.mainIssue}</td>
              {showOnboardingStatus && (
                <td className="py-3 pr-3 whitespace-nowrap text-xs font-medium text-neutral-700">
                  {s.onboardingStatus === "INVITED" && !s.registeredAccountCount && !s.pendingInvitationCount ? "Ingen konto" : ONBOARDING_STATUS_LABELS[s.onboardingStatus ?? "INVITED"]}
                </td>
              )}
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
                      aria-label="Marker som vurdert"
                      title="Marker denne leverandøren som vurdert"
                      onClick={() => onMarkReviewComplete(s)}
                      className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-tertiary-200 px-3 text-xs font-medium leading-none text-tertiary-700 hover:bg-tertiary-50"
                    >
                      Vurdert
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