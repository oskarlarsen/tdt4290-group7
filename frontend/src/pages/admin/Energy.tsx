import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, Download, Loader2, Search, ShieldCheck, Zap } from "lucide-react";
import { useEnergy } from "../../hooks/useEnergy";
import { KpiCard } from "../../components/ui/KpiCard";
import { TablePagination } from "../../components/ui/TablePagination";
import { EnergyTable } from "../../components/energy/EnergyTable";
import {
  ENERGY_STATUS_FILTERS,
  filterEnergy,
  getEnergyAttentionRows,
  sortEnergy,
  type EnergySortDirection,
  type EnergySortKey,
  type EnergyStatusFilter,
} from "../../components/energy/energyFilters";
import { EnergyDetailsDrawer } from "../../components/energy/EnergyDetailsDrawer";
import { EnergyAttentionCard } from "../../components/energy/EnergyAttentionCard";
import { ENERGY_STATUS_LABELS, currentReportingYear, formatKwh, formatPercent, summarizeEnergy } from "../../types/energy";
import { downloadCsv, toCsv } from "../../utils/csv";

const PAGE_SIZE = 6;

export default function Energy() {
  const thisYear = currentReportingYear();
  const years = [thisYear, thisYear - 1, thisYear - 2].filter((year) => year >= 2020 && year <= 2030);
  const [year, setYear] = useState(thisYear);
  const { data: energy, isLoading, isError } = useEnergy(year);

  const [statusFilter, setStatusFilter] = useState<EnergyStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EnergySortKey>("status");
  const [sortDirection, setSortDirection] = useState<EnergySortDirection>("asc");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => energy ?? [], [energy]);
  const filteredRows = useMemo(
    () => sortEnergy(filterEnergy(rows, statusFilter, search), sortKey, sortDirection),
    [rows, statusFilter, search, sortKey, sortDirection]
  );
  const attentionRows = useMemo(() => getEnergyAttentionRows(rows), [rows]);
  const totals = useMemo(() => summarizeEnergy(rows), [rows]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, sortKey, sortDirection, year]);

  function handleSort(key: EnergySortKey) {
    if (key === sortKey) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  if (isLoading) {
    return (
      <div role="status" className="flex h-64 items-center justify-center text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (isError || !energy) {
    return <div role="alert" className="p-4 text-sm text-red-700">Kunne ikke laste energidata. Prøv igjen.</div>;
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedRow = rows.find((row) => row.agreementId === selectedId) ?? null;
  const missingCount = rows.filter((row) => row.status === "MISSING_DATA").length;
  const noCommitmentCount = rows.filter((row) => row.status === "NO_COMMITMENT").length;

  const selfPercent = totals.committedSelfProducedKwh > 0 ? (totals.selfProducedKwh / totals.committedSelfProducedKwh) * 100 : null;
  const gooPercent = totals.committedGooKwh > 0 ? (totals.gooCoveredKwh / totals.committedGooKwh) * 100 : null;

  function handleExport() {
    if (filteredRows.length === 0) return;
    const csv = toCsv(
      filteredRows.map((row) => ({
        Leverandør: row.supplierName,
        "Org.nr.": row.orgNumber,
        Avtale: row.saksnr ?? "",
        År: row.year,
        "Rapporterte kvartaler": row.reportedQuarters.map((q) => `Q${q}`).join(" "),
        "Egenprodusert (kWh)": row.selfProducedKwh,
        "Lovet egenprodusert (kWh)": row.commitment?.minSelfProducedKwh ?? "",
        "Avvik egenprodusert, anslått (kWh)": row.selfProducedDeviationKwh === null ? "" : row.selfProducedDeviationKwh,
        "Dekket av opprinnelsesgarantier (kWh)": row.gooCoveredKwh,
        "Minimum opprinnelsesgarantier (kWh)": row.commitment?.minGooKwh ?? "",
        "Avvik opprinnelsesgarantier, anslått (kWh)": row.gooDeviationKwh === null ? "" : row.gooDeviationKwh,
        "Total energibruk (kWh)": row.consumedKwh,
        "Andel egenprodusert (%)": row.selfProducedSharePercent === null ? "" : Number(row.selfProducedSharePercent.toFixed(1)),
        "Energi per m² (kWh)": row.kwhPerSqm === null ? "" : Number(row.kwhPerSqm.toFixed(1)),
        Status: ENERGY_STATUS_LABELS[row.status],
      }))
    );
    downloadCsv(`energi-${year}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">Energi</h1>
            <p className="mt-1.5 max-w-170 text-sm leading-6 text-[#5c6773]">
              Om hver leverandør leverer den egenproduserte fornybare energien og opprinnelsesgarantiene som er lovet i avtalen,
              basert på kvartalsrapportene leverandørene sender inn.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">År:</span>
              <select
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                aria-label="Rapporteringsår"
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              >
                {years.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <button
              onClick={handleExport}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Eksporter (CSV)
            </button>
          </div>
        </div>
      </div>

      {noCommitmentCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>{noCommitmentCount} {noCommitmentCount === 1 ? "avtale mangler" : "avtaler mangler"} energiforpliktelse.</strong> Åpne avtalen og
          legg inn lovet kWh før rapportene kan kontrolleres.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Egenprodusert mot forpliktelse"
          value={selfPercent === null ? "—" : formatPercent(selfPercent)}
          note={selfPercent === null ? "Ingen avtale har både forpliktelse og rapport" : `${formatKwh(totals.selfProducedKwh)} av ${formatKwh(totals.committedSelfProducedKwh)}`}
          icon={<Zap className="h-4 w-4" style={{ color: "#2563EB" }} />}
          iconClassName="bg-primary-100 text-primary-900"
        />
        <KpiCard
          label="Opprinnelsesgarantier mot minimum"
          value={gooPercent === null ? "—" : formatPercent(gooPercent)}
          note={gooPercent === null ? "Ingen avtale har både forpliktelse og rapport" : `${formatKwh(totals.gooCoveredKwh)} av ${formatKwh(totals.committedGooKwh)}`}
          icon={<ShieldCheck className="h-4 w-4" style={{ color: "#16A34A" }} />}
          iconClassName="bg-tertiary-100 text-tertiary-700"
        />
        <KpiCard
          label="Avvik"
          value={totals.nonCompliantCount + totals.atRiskCount}
          sublabel={totals.nonCompliantCount + totals.atRiskCount === 1 ? "avtale" : "avtaler"}
          note={`${totals.nonCompliantCount} med avvik · ${totals.atRiskCount} fare for avvik`}
          icon={<AlertTriangle className="h-4 w-4" style={{ color: "#DC2626" }} />}
          iconClassName="bg-red-100 text-amber-700"
        />
        <KpiCard
          label="Rapportering"
          value={`${totals.reportedCount}/${totals.contractCount}`}
          sublabel={totals.contractCount === 1 ? "avtale har rapportert" : "avtaler har rapportert"}
          note={missingCount > 0 ? `${missingCount} uten rapport for ${year}` : (totals.contractCount === 0 ? `Ingen avtaler å rapportere for ${year}` : `Alle avtaler er rapportert for ${year}`)}
          icon={<ClipboardCheck className="h-4 w-4" style={{ color: "#EA580C" }} />}
          iconClassName="bg-yellow-100 text-orange-700"
        />
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søk etter leverandør, org.nr. eller avtale…"
              aria-label="Søk i energiavtaler"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-500 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">Status:</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as EnergyStatusFilter)}
              className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              aria-label="Filtrer energiavtaler etter status"
            >
              {ENERGY_STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
        </div>

        <EnergyTable
          rows={pagedRows}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          onSelect={(row) => setSelectedId(row.agreementId)}
          emptyMessage={rows.length === 0 ? "Ingen avtaler krever energirapportering ennå." : "Ingen avtaler samsvarer med filtrene"}
        />

        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          pageSize={PAGE_SIZE}
          itemLabel="avtale"
          onPageChange={setPage}
        />
      </section>

      {/* Portfolio-wide highlight: the most urgent contract, regardless of the filters above. */}
      <EnergyAttentionCard rows={attentionRows} onViewDetails={(row) => setSelectedId(row.agreementId)} />

      <EnergyDetailsDrawer row={selectedRow} onClose={() => setSelectedId(null)} />
    </div>
  );
}
