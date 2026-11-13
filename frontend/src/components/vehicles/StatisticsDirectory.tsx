import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useStatistics } from "../../hooks/useVehicles";
import type { TripRow } from "../../types/vehicle";
import { normalizePlate, vehicleDate } from "../../utils/vehicle";
import { StatisticsCard } from "./StatisticsCard";
import { ErrorNotice, Paging, VehicleDialog, buttonClass, inputClass } from "./VehicleDialog";

export function StatisticsTable({ rows, onSelect }: { rows: TripRow[]; onSelect: (row: TripRow) => void }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="text-xs text-neutral-500"><tr>{["Kjøretøy", "Rapporteringsperiode", "Distanse", "CO₂-utslipp", "Estimert CO₂", ""].map(label => <th key={label} scope="col" className="pb-3 pr-3 font-medium">{label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} className="border-t border-neutral-100">
      <td className="py-3 pr-3 font-mono">{row.registrationNumber}</td>
      <td className="py-3 pr-3 whitespace-nowrap">{vehicleDate(row.data.periodStart)} - {vehicleDate(row.data.periodEnd)}</td>
      <td className="py-3 pr-3">{row.data.totalTripKm} km</td>
      <td className="py-3 pr-3">{row.data.co2GramsPerKm == null ? "Ikke relevant" : `${row.data.co2GramsPerKm} g/km`}</td>
      <td className="py-3 pr-3">{row.estimatedCo2Kg == null ? "Ikke relevant" : `${row.estimatedCo2Kg} kg`}</td>
      <td className="py-3"><button className={buttonClass} onClick={() => onSelect(row)} aria-label={`Vis detaljer for ${row.registrationNumber}, ${row.data.periodStart} til ${row.data.periodEnd}`}>Vis detaljer</button></td>
    </tr>)}</tbody>
  </table></div>;
}
export function StatisticsRowDetails({ row, onClose, onOpenVehicle }: { row: TripRow; onClose: () => void; onOpenVehicle: (plate: string) => void }) {
  return <VehicleDialog title={`Statistikk for ${row.registrationNumber}`} onClose={onClose} wide>
    <StatisticsCard row={row} /><footer className="mt-4 flex justify-end"><button className={buttonClass} onClick={() => { onClose(); onOpenVehicle(row.registrationNumber); }}>Åpne kjøretøy</button></footer>
  </VehicleDialog>;
}

export function StatisticsDirectory({ onOpenVehicle }: { onOpenVehicle: (plate: string) => void }) {
  const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TripRow | null>(null);
  const statistics = useStatistics(query, page);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(normalizePlate(search)); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  return <>
    <section className="space-y-3">
      <label className="mb-4 block w-full max-w-xs text-xs text-neutral-600"><span className="mb-1.5 block font-medium">Søk etter registreringsnummer i statistikken</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" /><input className={`${inputClass} pl-9`} placeholder="Søk etter skilt…" value={search} onChange={event => setSearch(event.target.value)} /></div></label>
      {statistics.isLoading && <p role="status" className="py-8 text-center text-neutral-500">Laster statistikk…</p>}
      <ErrorNotice error={statistics.error} />
      {statistics.isError && <button className={`${buttonClass} mt-3`} onClick={() => void statistics.refetch()}>Prøv å laste statistikken på nytt</button>}
      {statistics.data && <>
        {statistics.data.items.length ? <StatisticsTable rows={statistics.data.items} onSelect={setSelected} /> : <p className="py-10 text-center text-sm text-neutral-500">Ingen samsvarende statistikkrader. Legg til rapporterte data eller tøm søket.</p>}
        <div className="pb-1"><Paging page={page} total={statistics.data.total} pageSize={25} onChange={setPage} /></div>
      </>}
    </section>
    {selected && <StatisticsRowDetails row={selected} onClose={() => setSelected(null)} onOpenVehicle={onOpenVehicle} />}
  </>;
}
