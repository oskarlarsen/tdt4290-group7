import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Flame, Leaf, Loader2, Plus, Search, Zap } from "lucide-react";
import { useEnergy } from "../../hooks/useEnergy";
import { useContracts } from "../../hooks/useContracts";
import { KpiCard } from "../../components/ui/KpiCard";
import { NotConnectedDialog } from "../../components/ui/NotConnectedDialog";
import { TablePagination } from "../../components/ui/TablePagination";
import { EnergyTable } from "../../components/energy/EnergyTable";
import type { EnergyRow, MissingEnergyRow } from "../../components/energy/EnergyTable";
import {
  ENERGY_STATUS_FILTERS,
  filterEnergyRows,
  getEnergyAttentionRows,
  getEnergyStatusLabel,
  type EnergyStatusFilter,
} from "../../components/energy/energyFilters";
import { EnergyDetailsDrawer } from "../../components/energy/EnergyDetailsDrawer";
import { EnergyAttentionCard } from "../../components/energy/EnergyAttentionCard";
import {
  analyzeEnergy,
  formatEnergy,
  formatPercent,
  getTotalKwh,
  summarizeEnergyRows,
} from "../../types/energy";
import type { EnergyCarrier, EnergyComplianceStatus, EnergyRequirement } from "../../types/energy";
import { downloadCsv, toCsv } from "../../utils/csv";

const PAGE_SIZE = 6; // same as the reference; the logic doesn't assume how many rows exist
const ENERGY_CARRIERS: EnergyCarrier[] = ["electric", "biogas", "fossil"];

function hasValidConsumption(
  consumption: Partial<Record<EnergyCarrier, unknown>> | null | undefined
): boolean {
  return (
    consumption !== null &&
    typeof consumption === "object" &&
    ENERGY_CARRIERS.every(
      (carrier) =>
        typeof consumption[carrier] === "number" &&
        Number.isFinite(consumption[carrier]) &&
        consumption[carrier] >= 0
    )
  );
}

function hasValidRequirement(requirement: EnergyRequirement | null | undefined): boolean {
  return (
    requirement !== null &&
    requirement !== undefined &&
    Number.isFinite(requirement.minRenewableSharePercent) &&
    requirement.minRenewableSharePercent >= 0 &&
    requirement.minRenewableSharePercent <= 100
  );
}

// Most urgent first; within a tier, the largest shortfall first.
function compareBySeverity(a: EnergyRow, b: EnergyRow): number {
  if (a.analysis.rank !== b.analysis.rank) return a.analysis.rank - b.analysis.rank;
  if (a.analysis.shortfallPoints !== b.analysis.shortfallPoints) {
    return b.analysis.shortfallPoints - a.analysis.shortfallPoints;
  }
  return (a.contract?.supplierName ?? "").localeCompare(b.contract?.supplierName ?? "");
}

export default function Energy() {
  const { data: energy, isLoading: energyLoading, isError: energyError } = useEnergy();
  const { data: contracts, isLoading: contractsLoading, isError: contractsError } = useContracts();

  const [statusFilter, setStatusFilter] = useState<EnergyStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRecordInfoOpen, setIsRecordInfoOpen] = useState(false);
  const requirementByContract = useMemo(
    () => new Map((energy?.requirements ?? []).map((requirement) => [requirement.contractId, requirement])),
    [energy]
  );

  // Only records with valid requirements and positive, complete consumption can be assessed.
  const rows = useMemo<EnergyRow[]>(() => {
    if (!energy || !contracts) return [];
    const contractById = new Map(contracts.map((c) => [c.id, c]));
    return energy.records
      .flatMap<EnergyRow>((record) => {
        const requirement = requirementByContract.get(record.contractId);
        if (
          !requirement ||
          !hasValidRequirement(requirement) ||
          !hasValidConsumption(record.consumptionKwh) ||
          getTotalKwh(record.consumptionKwh) <= 0
        ) {
          return [];
        }
        return [
          {
            record,
            requirement,
            contract: contractById.get(record.contractId),
            analysis: analyzeEnergy(record, requirement),
          },
        ];
      })
      .sort(compareBySeverity);
  }, [energy, contracts, requirementByContract]);

  const counts = useMemo(() => {
    const result: Record<EnergyComplianceStatus, number> = {
      compliant: 0,
      "minor-deviation": 0,
      breach: 0,
    };
    for (const { analysis } of rows) result[analysis.status] += 1;
    return result;
  }, [rows]);

  const missingRows = useMemo<MissingEnergyRow[]>(() => {
    if (!contracts) return [];
    const assessedContractIds = new Set(rows.map(({ record }) => record.contractId));
    return contracts.flatMap((contract) => {
      const requirement = requirementByContract.get(contract.id);
      if (
        !requirement ||
        !hasValidRequirement(requirement) ||
        assessedContractIds.has(contract.id)
      ) {
        return [];
      }
      return [{ kind: "missing", id: `missing-${contract.id}`, contract, requirement }];
    });
  }, [contracts, requirementByContract, rows]);

  const filteredRows = useMemo(
    () => filterEnergyRows(rows, missingRows, statusFilter, search),
    [rows, missingRows, statusFilter, search]
  );
  const attentionRows = useMemo(
    () => getEnergyAttentionRows(rows),
    [rows]
  );

  // Reset pagination when filtered records change, including underlying data updates.
  useEffect(() => {
    setPage(1);
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (energyLoading || contractsLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (energyError || contractsError || !energy || !contracts) {
    return <div className="text-sm text-red-700">Couldn't load energy data. Try again.</div>;
  }

  // Every KPI is a direct calculation over the monitored records.
  const monitoredCount = rows.length;
  const { totalKwh, renewableSharePercent, weightedMinimumPercent, fossilExcessKwh } =
    summarizeEnergyRows(rows);
  const flaggedCount = counts["minor-deviation"] + counts.breach;

  const requirementIds = new Set(energy.requirements.map((r) => r.contractId));
  const recordedIds = new Set(energy.records.map((r) => r.contractId));
  const applicableContracts = contracts.filter((c) => requirementIds.has(c.id));
  const dataMissingContracts = applicableContracts.filter((c) => !recordedIds.has(c.id));
  const invalidRecordCount = energy.records.filter((record) => {
    const requirement = requirementByContract.get(record.contractId);
    return (
      requirement !== undefined &&
      (!hasValidRequirement(requirement) || !hasValidConsumption(record.consumptionKwh))
    );
  }).length;

  const selectedRow = rows.find((r) => r.record.id === selectedId) ?? null;

  function handleExport() {
    if (filteredRows.length === 0) return;
    const csv = toCsv(
      filteredRows.map((row) => {
        if (row.kind === "missing") {
          return {
            Supplier: row.contract.supplierName,
            "Org ID": row.contract.supplierOrgId,
            Contract: row.contract.contractName,
            Period: "",
            "Electric (kWh)": "",
            "Biogas (kWh)": "",
            "Fossil (kWh)": "",
            "Total (kWh)": "",
            "Renewable share (%)": "",
            "Minimum renewable share (%)": row.requirement.minRenewableSharePercent,
            Status: "Missing data",
          };
        }
        return {
          Supplier: row.contract?.supplierName ?? "",
          "Org ID": row.contract?.supplierOrgId ?? "",
          Contract: row.contract?.contractName ?? "",
          Period: row.record.period,
          "Electric (kWh)": row.record.consumptionKwh.electric,
          "Biogas (kWh)": row.record.consumptionKwh.biogas,
          "Fossil (kWh)": row.record.consumptionKwh.fossil,
          "Total (kWh)": row.analysis.totalKwh,
          "Renewable share (%)": Number(row.analysis.renewableSharePercent.toFixed(1)),
          "Minimum renewable share (%)": row.requirement.minRenewableSharePercent,
          Status: getEnergyStatusLabel(row.analysis.status),
        };
      })
    );
    downloadCsv(`energy-fuel-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Energy &amp; Fuel Monitoring
            </h1>
            <p className="mt-1.5 max-w-170 text-sm leading-6 text-[#5c6773]">
              Renewable energy and fuel-mix tracking against each contract&apos;s minimum renewable share, based on
              supplier-reported quarterly statistics.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <button
              onClick={handleExport}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export (CSV)
            </button>
            <button
              onClick={() => setIsRecordInfoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Record Energy Data
            </button>
          </div>
        </div>
      </div>

      {dataMissingContracts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Energy data not yet submitted</strong> for:{" "}
          {dataMissingContracts.map((c) => `${c.contractName} (${c.supplierName})`).join(", ")}. These
          contracts have an energy requirement, but nothing can be checked until data is submitted.
        </div>
      )}

      {invalidRecordCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Some energy data couldn't be assessed.</strong> {invalidRecordCount} record
          {invalidRecordCount === 1 ? " has" : "s have"} invalid consumption values or contract minimums and
          {invalidRecordCount === 1 ? " was" : " were"} excluded from the calculations.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Monitored consumption"
          value={monitoredCount > 0 ? formatEnergy(totalKwh) : "—"}
          valueClassName="!text-xl text-neutral-900"
          sublabel={`across ${monitoredCount} contract${monitoredCount === 1 ? "" : "s"}`}
          note={monitoredCount > 0 ? "Fictional quarterly records" : "No assessable fictional records"}
          icon={<Zap className="h-4 w-4" style={{ color: "#2563EB" }} />}
          iconClassName="bg-primary-100 text-primary-900"
        />
        <KpiCard
          label="Renewable share"
          value={renewableSharePercent === null ? "—" : formatPercent(renewableSharePercent)}
          sublabel="of reported energy"
          note={
            renewableSharePercent !== null && weightedMinimumPercent !== null
              ? `Fictional data · weighted contract minimum: ${formatPercent(weightedMinimumPercent)}`
              : "No assessable fictional records"
          }
          noteTone="neutral"
          icon={<Leaf className="h-4 w-4" style={{ color: "#16A34A" }} />}
          iconClassName="bg-tertiary-100 text-tertiary-700"
        />
        <KpiCard
          label="Fossil above limit"
          value={monitoredCount > 0 ? formatEnergy(fossilExcessKwh) : "—"}
          valueClassName="!text-xl text-neutral-900"
          sublabel="above contract limit"
          note={
            monitoredCount === 0
              ? "No assessable fictional records"
              : flaggedCount > 0
                ? `Fictional data · ${flaggedCount} contract${flaggedCount === 1 ? "" : "s"} above own limit`
                : "Fictional data · none above contract limits"
          }
          noteTone="neutral"
          icon={<Flame className="h-4 w-4" style={{ color: "#EA580C" }} />}
          iconClassName="bg-yellow-100 text-orange-700"
        />
        <KpiCard
          label="Deviation flags"
          value={monitoredCount > 0 ? flaggedCount : "—"}
          sublabel="assessed records"
          note={
            monitoredCount === 0
              ? "No assessable fictional records"
              : `Fictional data · ${counts.breach} breach · ${counts["minor-deviation"]} minor`
          }
          noteTone="neutral"
          icon={<AlertTriangle className="h-4 w-4" style={{ color: "#DC2626" }} />}
          iconClassName="bg-red-100 text-amber-700"
        />
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier, org no., or contract…"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">Status:</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as EnergyStatusFilter)}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              aria-label="Filter energy records by status"
            >
              {ENERGY_STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <EnergyTable
          rows={pagedRows}
          onSelect={(row) => setSelectedId(row.record.id)}
          emptyMessage={
            rows.length === 0
              ? "No assessable energy records available"
              : "No contracts match the current filters"
          }
        />

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          pageSize={PAGE_SIZE}
          itemLabel="contract"
          onPageChange={setPage}
        />
      </section>

      {/* Portfolio-wide highlight: the most severe breach, regardless of the filters above. */}
      <EnergyAttentionCard
        rows={attentionRows}
        onViewDetails={(row) => setSelectedId(row.record.id)}
      />

      <EnergyDetailsDrawer row={selectedRow} onClose={() => setSelectedId(null)} />

      <NotConnectedDialog
        open={isRecordInfoOpen}
        title="Record energy data"
        message="Recording energy data isn't available yet. Energy records are currently fictional mock data. A real flow would take supplier quarterly energy and fuel statistics (Excel via Mercell), which isn't connected"
        onClose={() => setIsRecordInfoOpen(false)}
      />
    </div>
  );
}