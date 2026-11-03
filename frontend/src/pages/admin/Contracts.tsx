import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileText, Leaf, Plus, Search, X } from "lucide-react";
import { useContracts } from "../../hooks/useContracts";
import { ContractsTable } from "../../components/contracts/ContractsTable";
import { ContractDetailsDrawer } from "../../components/contracts/ContractDetailsDrawer";
import { ContractComplianceSummary } from "../../components/contracts/ContractComplianceSummary";
import { KpiCard } from "../../components/ui/KpiCard";
import type { DerivedContract } from "../../types/contract";
import { downloadCsv, toCsv } from "../../utils/csv";

type ContractStatusFilter = "all" | DerivedContract["status"];
type ComplianceFilter = "all" | DerivedContract["risk"];

const CONTRACTS_PAGE_SIZE = 3;

export default function Contracts() {
  const { data: contracts, isLoading, isError } = useContracts();
  const [contractStatusFilter, setContractStatusFilter] = useState<ContractStatusFilter>("all");
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>("all");
  const [search, setSearch] = useState("");
  const [isSearchSuggestionsOpen, setIsSearchSuggestionsOpen] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [isRegistrationInfoOpen, setIsRegistrationInfoOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<DerivedContract | null>(null);
  const [page, setPage] = useState(1);

  const summary = contracts
    ? {
        totalActiveContracts: contracts.length,
        supplierCount: new Set(contracts.map((contract) => contract.supplierId)).size,
        compliant: contracts.filter((contract) => contract.risk === "compliant").length,
        underReview: contracts.filter((contract) => contract.risk === "medium").length,
        actionNeeded: contracts.filter((contract) => contract.risk === "high").length,
        compliancePercent:
          contracts.length > 0
            ? Math.round(
                (contracts.filter((contract) => contract.risk === "compliant").length /
                  contracts.length) *
                  100
              )
            : null,
      }
    : {
        totalActiveContracts: null,
        supplierCount: null,
        compliant: null,
        underReview: null,
        actionNeeded: null,
        compliancePercent: null,
      };

  const environmentalProgressPercent = useMemo(() => {
    if (!contracts) return null;

    const totals = contracts.reduce(
      (accumulator, contract) => {
        const goal = contract.environmentalGoal;
        const actual = contract.environmentalActual;
        if (
          typeof goal !== "number" ||
          !Number.isFinite(goal) ||
          goal <= 0 ||
          typeof actual !== "number" ||
          !Number.isFinite(actual) ||
          actual < 0
        ) {
          return accumulator;
        }

        return {
          goal: accumulator.goal + goal,
          actual: accumulator.actual + actual,
          validCount: accumulator.validCount + 1,
        };
      },
      { goal: 0, actual: 0, validCount: 0 }
    );

    if (
      totals.validCount === 0 ||
      !Number.isFinite(totals.goal) ||
      !Number.isFinite(totals.actual) ||
      totals.goal <= 0
    ) {
      return null;
    }

    return Math.min(100, Math.round((totals.actual / totals.goal) * 100));
  }, [contracts]);

  const searchSuggestions = useMemo(() => {
    if (!contracts) return [];

    const query = search.trim().toLowerCase();
    if (!query) return [];

    return contracts
      .filter(
        (contract) =>
          (contractStatusFilter === "all" || contract.status === contractStatusFilter) &&
          (complianceFilter === "all" || contract.risk === complianceFilter)
      )
      .filter(
        (contract) =>
          contract.contractName.toLowerCase().includes(query) ||
          contract.supplierName.toLowerCase().includes(query)
      )
      .slice(0, 6);
  }, [contracts, contractStatusFilter, complianceFilter, search]);

  const filteredContracts = useMemo(() => {
    if (!contracts) return [];

    const query = search.trim().toLowerCase();
    const statusPriority: Record<DerivedContract["status"], number> = {
      Expired: 0,
      "Expiring Soon": 1,
      Active: 2,
    };

    return [...contracts]
      .filter(
        (contract) =>
          selectedSuggestionId === null || contract.id === selectedSuggestionId
      )
      .filter(
        (contract) =>
          contractStatusFilter === "all" || contract.status === contractStatusFilter
      )
      .filter((contract) => complianceFilter === "all" || contract.risk === complianceFilter)
      .filter(
        (contract) =>
          query.length === 0 ||
          contract.contractName.toLowerCase().includes(query) ||
          contract.supplierName.toLowerCase().includes(query)
      )
      .sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
  }, [contracts, selectedSuggestionId, contractStatusFilter, complianceFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [selectedSuggestionId, contractStatusFilter, complianceFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / CONTRACTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * CONTRACTS_PAGE_SIZE;
  const paginatedContracts = filteredContracts.slice(pageStart, pageStart + CONTRACTS_PAGE_SIZE);

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-neutral-400">Loading...</div>;
  }

  if (isError && !contracts) {
    return <div className="text-sm text-red-700">Couldn't load contracts. Try again.</div>;
  }

  const totalContracts = contracts?.length ?? 0;

  function handleExport() {
    const rows = filteredContracts.map((contract) => ({
      Contract: contract.contractName,
      Supplier: contract.supplierName,
      "Supplier org ID": contract.supplierOrgId,
      Risk: contract.risk.toUpperCase(),
      "Main issue": contract.mainIssue,
    }));

    if (rows.length === 0) return;

    const csv = toCsv(rows);
    downloadCsv(`contracts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const cards = [
    {
      label: "TOTAL ACTIVE CONTRACTS",
      value: summary.totalActiveContracts,
      sublabel: `Across ${summary.supplierCount ?? "—"} suppliers`,
      icon: FileText,
      iconStyle: "bg-primary-100 text-primary-900",
    },
    {
      label: "COMPLIANT",
      value: summary.compliant,
      sublabel:
        summary.compliancePercent === null
          ? "No data available"
          : `${summary.compliancePercent}% of all contracts`,
      icon: CheckCircle2,
      iconStyle: "bg-tertiary-100 text-tertiary-700",
    },
    {
      label: "UNDER REVIEW / MINOR",
      value: summary.underReview,
      sublabel: "Audits or checks scheduled",
      icon: Clock3,
      iconStyle: "bg-orange-100 text-orange-700",
    },
    {
      label: "ACTION NEEDED / BREACH",
      value: summary.actionNeeded,
      sublabel: "Active cure notice required",
      icon: AlertTriangle,
      iconStyle: "bg-red-100 text-red-700",
    },
  ];

  return (
    <div className="space-y-4 bg-[#f3f5f3] p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              Compliance <span className="text-[#9aa4ae]">&gt;</span> Contracts Overview
            </div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Contracts Overview
            </h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-6 text-[#5c6773]">
              Manage municipal contracts, supplier environmental performance, and compliance
              status in one place.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleExport}
              disabled={filteredContracts.length === 0}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#dfe3e8] bg-[#f5f7f8] px-3 text-xs font-medium text-[#1f2937] shadow-sm transition-colors hover:bg-[#eef2f5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              onClick={() => setIsRegistrationInfoOpen(true)}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1f4d46] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#173a34]"
            >
              <Plus className="h-4 w-4" />
              Register Contract
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, sublabel, icon: Icon, iconStyle }) => (
          <KpiCard
            key={label}
            label={label}
            value={value ?? "—"}
            sublabel={sublabel}
            icon={<Icon className="h-4 w-4" />}
            iconClassName={iconStyle}
          />
        ))}
      </div>

      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d9e7df] bg-[#f1f8f4] text-[#1d9d70]">
              <Leaf className="h-4 w-4" />
            </div>
            <div>
              <div className="text-base font-semibold text-[#1f2937]">
                Overall Environmental Goal Progress
              </div>
              <div className="mt-1 max-w-[520px] text-xs leading-5 text-[#6b7280]">
                Aggregated performance across fleet electrification, renewable fuels, and green
                certifications
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:justify-end">
            <div className="text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[#5d6a74]">
              Overall Compliance
            </div>
            <div className="text-xl font-semibold leading-none tracking-[-0.04em] text-[#1f2937]">
              {environmentalProgressPercent === null
                ? "—"
                : `${environmentalProgressPercent}%`}
            </div>
            {environmentalProgressPercent !== null && (
              <div className="rounded-full bg-[#dfeee5] px-2.5 py-1 text-[0.7rem] font-semibold text-[#1f7b5b]">
                On Track
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#e8ece9]">
          {environmentalProgressPercent !== null && (
            <div
              className="h-full rounded-full bg-[#1d9d70]"
              style={{ width: `${environmentalProgressPercent}%` }}
            />
          )}
        </div>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div
            className="relative w-full max-w-xs"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsSearchSuggestionsOpen(false);
              }
            }}
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedSuggestionId(null);
                setIsSearchSuggestionsOpen(true);
              }}
              onFocus={() => setIsSearchSuggestionsOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setIsSearchSuggestionsOpen(false);
              }}
              placeholder="Search contracts…"
              aria-label="Search contracts"
              aria-autocomplete="list"
              aria-expanded={isSearchSuggestionsOpen && search.trim().length > 0}
              aria-controls="contract-search-suggestions"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
            {isSearchSuggestionsOpen && search.trim().length > 0 && (
              <div
                id="contract-search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
              >
                {searchSuggestions.length > 0 ? (
                  searchSuggestions.map((contract) => (
                    <button
                      key={contract.id}
                      type="button"
                      role="option"
                      aria-selected={selectedSuggestionId === contract.id}
                      onClick={() => {
                        setSearch(contract.contractName);
                        setSelectedSuggestionId(contract.id);
                        setIsSearchSuggestionsOpen(false);
                      }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-neutral-50"
                    >
                      <span className="font-medium text-neutral-800">{contract.contractName}</span>
                      <span className="mt-0.5 text-neutral-500">{contract.supplierName}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-neutral-500">No matching contracts</div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Contract Status:</span>
              <div className="relative">
                <select
                  value={contractStatusFilter}
                  onChange={(event) =>
                    setContractStatusFilter(event.target.value as ContractStatusFilter)
                  }
                  className="appearance-none rounded-md border border-neutral-200 bg-white px-2 py-1 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                  aria-label="Filter contracts by contract status"
                >
                  <option value="all">All</option>
                  <option value="Active">Active</option>
                  <option value="Expiring Soon">Expiring Soon</option>
                  <option value="Expired">Expired</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
              </div>
            </label>

            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Environmental Compliance:</span>
              <div className="relative">
                <select
                  value={complianceFilter}
                  onChange={(event) =>
                    setComplianceFilter(event.target.value as ComplianceFilter)
                  }
                  className="appearance-none rounded-md border border-neutral-200 bg-white px-2 py-1 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                  aria-label="Filter contracts by environmental compliance"
                >
                  <option value="all">All</option>
                  <option value="high">Non-compliant</option>
                  <option value="medium">Partial</option>
                  <option value="compliant">Compliant</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
              </div>
            </label>
          </div>
        </div>

        <ContractsTable contracts={paginatedContracts} onViewDetails={setSelectedContract} />

        <div className="-mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="text-xs text-neutral-500">
            {filteredContracts.length === 0
              ? "No contracts match the current filters"
              : `Showing ${pageStart + 1}–${Math.min(pageStart + CONTRACTS_PAGE_SIZE, filteredContracts.length)} of ${filteredContracts.length} contract${filteredContracts.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      <ContractComplianceSummary contracts={contracts ?? []} onViewDetails={setSelectedContract} />

      <ContractDetailsDrawer contract={selectedContract} onClose={() => setSelectedContract(null)} />

      {isRegistrationInfoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
          onClick={() => setIsRegistrationInfoOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-registration-title"
            className="w-full max-w-md rounded-xl border border-neutral-100 bg-white p-4 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="contract-registration-title" className="font-headline text-lg font-semibold text-neutral-900">
                  Contract registration
                </h2>
                <p className="mt-2 text-sm leading-5 text-neutral-600">
                  Contract records are currently derived from suppliers’ primary contract data.
                  Contract-specific registration details and saving are not available yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegistrationInfoOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRegistrationInfoOpen(false)}
                className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
