import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useDashboardSummary } from "../../hooks/useDashboardSummary";
import { useSupplierReviewStatus, type FollowUpStatus } from "../../hooks/useSupplierReviewStatus";
import { TopRiskSuppliersTable } from "../../components/suppliers/TopRiskSuppliersTable";
import { SupplierDetailsDrawer } from "../../components/suppliers/SupplierDetailsDrawer";
import type { TopRiskSupplier } from "../../types/dashboard";

const RISK_ORDER: Record<TopRiskSupplier["risk"], number> = {
  high: 0,
  medium: 1,
  compliant: 2,
};

export default function Suppliers() {
  const { data, isLoading, isError } = useDashboardSummary();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [riskFilter, setRiskFilter] = useState<"all" | TopRiskSupplier["risk"]>("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | FollowUpStatus>("all");
  const { getStatus, setStatus } = useSupplierReviewStatus();

  /** Open the existing supplier drawer when reached from other pages */
  useEffect(() => {
    const id = searchParams.get("supplierId");
    if (id) setSelectedSupplierId(id);
  }, [searchParams]);

  function handleCloseDrawer() {
    setSelectedSupplierId(null);
    if (searchParams.get("supplierId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("supplierId");
      setSearchParams(next, { replace: true });
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return <div className="text-sm text-red-700">Couldn't load suppliers. Try again.</div>;
  }

  const { topRiskSuppliers, kpis, recentAlerts } = data;
  const sortedSuppliers = [...topRiskSuppliers].sort(
    (a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
  );
  const filteredSuppliers = sortedSuppliers.filter((supplier) => {
    const matchesRisk = riskFilter === "all" || supplier.risk === riskFilter;
    const matchesReviewStatus =
      reviewStatusFilter === "all" || getStatus(supplier.id) === reviewStatusFilter;
    return matchesRisk && matchesReviewStatus;
  });
  const selectedSupplier = sortedSuppliers.find((s) => s.id === selectedSupplierId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">Suppliers</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Suppliers currently monitored for vehicle, certificate, and fuel/energy compliance.
        </p>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">Risk:</span>
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value as "all" | TopRiskSupplier["risk"])}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              aria-label="Filter suppliers by risk level"
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="compliant">Compliant</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">Review Status:</span>
            <select
              value={reviewStatusFilter}
              onChange={(event) => setReviewStatusFilter(event.target.value as "all" | FollowUpStatus)}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              aria-label="Filter suppliers by review status"
            >
              <option value="all">All</option>
              <option value="to-review">To Review</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>

        {filteredSuppliers.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500">
            No suppliers match the selected filters.
          </div>
        ) : (
          <TopRiskSuppliersTable
            suppliers={filteredSuppliers}
            actionLabel="View Details"
            onSelect={(supplier) => setSelectedSupplierId(supplier.id)}
            getReviewStatus={getStatus}
          />
        )}

        <div className="-mx-4 -mb-4 mt-4 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="text-xs text-neutral-500">
            {filteredSuppliers.length} supplier{filteredSuppliers.length === 1 ? "" : "s"} shown
            {filteredSuppliers.length !== topRiskSuppliers.length && (
              <>
                {" of "}
                {topRiskSuppliers.length}
              </>
            )}{" "}
            out of {kpis.monitoredSuppliers} suppliers monitored municipality-wide — individual
            records for the rest require backend integration.
          </p>
        </div>
      </section>

      <SupplierDetailsDrawer
        supplier={selectedSupplier}
        alerts={recentAlerts}
        reviewStatus={selectedSupplier ? getStatus(selectedSupplier.id) : "to-review"}
        onChangeReviewStatus={(status) => selectedSupplier && setStatus(selectedSupplier.id, status)}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}