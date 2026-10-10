import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useDashboardSummary } from "../../hooks/useDashboardSummary";
import { useSupplierReviewStatus, type FollowUpStatus } from "../../hooks/useSupplierReviewStatus";
import { TopRiskSuppliersTable } from "../../components/suppliers/TopRiskSuppliersTable";
import { SupplierDetailsDrawer } from "../../components/suppliers/SupplierDetailsDrawer";
import { SuppliersOverviewHeader } from "../../components/suppliers/SuppliersOverviewHeader";
import { toCsv, downloadCsv } from "../../utils/csv";
import type { TopRiskSupplier } from "../../types/dashboard";

const RISK_ORDER: Record<TopRiskSupplier["risk"], number> = {
  high: 0,
  medium: 1,
  compliant: 2,
};
const SUPPLIERS_PAGE_SIZE = 3;

export default function Suppliers() {
  const { data, isLoading, isError } = useDashboardSummary();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [riskFilter, setRiskFilter] = useState<"all" | TopRiskSupplier["risk"]>("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | FollowUpStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { getStatus, setStatus } = useSupplierReviewStatus();

  useEffect(() => {
    setPage(1);
  }, [search, riskFilter, reviewStatusFilter]);

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

  const { topRiskSuppliers, kpis, riskClassification, recentAlerts } = data;
  const sortedSuppliers = [...topRiskSuppliers].sort(
    (a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
  );
  const query = search.trim().toLowerCase();
  const filteredSuppliers = sortedSuppliers.filter((supplier) => {
    const matchesRisk = riskFilter === "all" || supplier.risk === riskFilter;
    const matchesReviewStatus =
      reviewStatusFilter === "all" || getStatus(supplier.id) === reviewStatusFilter;
    const matchesSearch =
      query.length === 0 ||
      supplier.displayName.toLowerCase().includes(query) ||
      supplier.orgId.toLowerCase().includes(query) ||
      supplier.primaryContract.toLowerCase().includes(query) ||
      supplier.mainIssue.toLowerCase().includes(query);
    return matchesRisk && matchesReviewStatus && matchesSearch;
  });
  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / SUPPLIERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * SUPPLIERS_PAGE_SIZE;
  const paginatedSuppliers = filteredSuppliers.slice(pageStart, pageStart + SUPPLIERS_PAGE_SIZE);
  const selectedSupplier = sortedSuppliers.find((s) => s.id === selectedSupplierId) ?? null;

  function handleExportDirectory() {
    const csv = toCsv(
      sortedSuppliers.map((s) => ({
        Supplier: s.displayName,
        "Org ID": s.orgId,
        Contract: s.primaryContract,
        Risk: s.risk.toUpperCase(),
        "Main issue": s.mainIssue,
      }))
    );
    downloadCsv(`suppliers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      <SuppliersOverviewHeader
        monitoredSuppliers={kpis.monitoredSuppliers}
        modeledSupplierCount={sortedSuppliers.length}
        highCount={riskClassification.high.count}
        mediumCount={riskClassification.medium.count}
        compliantCount={riskClassification.compliant.count}
        compliantPercent={riskClassification.compliant.percent}
        onExport={handleExportDirectory}
      />

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search suppliers…"
              aria-label="Search suppliers"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {filteredSuppliers.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500">No suppliers match the selected filters.</div>
        ) : (
          <TopRiskSuppliersTable
            suppliers={paginatedSuppliers}
            actionLabel="View Details"
            onSelect={(supplier) => setSelectedSupplierId(supplier.id)}
            getReviewStatus={getStatus}
          />
        )}

        <div className="-mx-4 -mb-4 mt-4 flex items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="min-w-0 text-xs text-neutral-500">
            Showing {filteredSuppliers.length === 0 ? 0 : pageStart + 1}–
            {Math.min(pageStart + SUPPLIERS_PAGE_SIZE, filteredSuppliers.length)} of {filteredSuppliers.length} suppliers
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="font-mono text-xs text-neutral-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
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