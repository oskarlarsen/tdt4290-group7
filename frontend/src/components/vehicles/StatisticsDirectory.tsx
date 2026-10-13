import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useStatistics } from "../../hooks/useVehicles";
import type { TripRow } from "../../types/vehicle";
import { DECIMAL_FIELDS, normalizePlate, timestamp } from "../../utils/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../../utils/vehicleCatalog";
import { ErrorNotice, Paging, VehicleDialog, buttonClass, inputClass } from "./VehicleDialog";

export function StatisticsTable({ rows, onSelect }: { rows: TripRow[]; onSelect: (row: TripRow) => void }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="text-xs font-mono uppercase tracking-wide text-neutral-400"><tr>
      {["Registration number", "Reporting period", "Distance (km)", "Calculated CO₂ (kg)", "NOx (g)", "Jobs/trips", "Added"].map(label => <th key={label} scope="col" className="pb-2 pr-3 font-medium">{label}</th>)}
    </tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
      <td className="py-3 pr-3"><button className="rounded font-mono font-medium text-neutral-900 hover:text-primary-900 hover:underline focus-visible:ring-2 focus-visible:ring-primary-700/30" aria-label={`View statistics for ${row.registrationNumber}, ${row.data.periodStart} to ${row.data.periodEnd}`} onClick={() => onSelect(row)}>{row.registrationNumber}</button></td>
      <td className="py-3 pr-3 whitespace-nowrap">{row.data.periodStart} — {row.data.periodEnd}</td>
      <td className="py-3 pr-3">{row.data.totalTripKm}</td>
      <td className="py-3 pr-3">{row.estimatedCo2Kg}</td>
      <td className="py-3 pr-3">{row.data.totalNoxRegisteredGrams}</td>
      <td className="py-3 pr-3">{row.data.tripCount}</td>
      <td className="py-3 text-xs text-neutral-500">{timestamp(row.createdAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function StatisticsRowDetails({ row, onClose, onOpenVehicle }: { row: TripRow; onClose: () => void; onOpenVehicle: (plate: string) => void }) {
  return <VehicleDialog title={`Statistics for ${row.registrationNumber}`} onClose={onClose}>
    <p className="mb-4 text-sm text-neutral-600">{row.data.periodStart} — {row.data.periodEnd}. Saved rows are append-only; this view does not run a check.</p>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {[
        ["Vehicle category", catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory)],
        ["Fuel technology", catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology)],
        ["Body type", catalogLabel(BODY_TYPES, row.data.bodyType)],
        ["Make", row.data.make], ["Model", row.data.model],
        ["Registered as CO₂-emitting", row.data.co2Registered ? "Yes" : "No"],
        ["Total CO₂ (kg, calculated)", row.estimatedCo2Kg],
        ...DECIMAL_FIELDS.map(([key, label]) => [label, row.data[key] ?? "Not applicable"]),
        ["Jobs/trips", row.data.tripCount], ["Source / reference", row.sourceName ?? "Not provided"],
        ["Assignment reference", row.data.assignmentNumber ?? "Not provided"], ["Comment", row.data.comment ?? "Not provided"],
        ["Added", timestamp(row.createdAt)], ["Row ID", row.id],
      ].map(([label, value]) => <div key={String(label)}><dt className="text-neutral-500">{label}</dt><dd className="break-words font-medium text-neutral-900">{value}</dd></div>)}
    </dl>
    <p className="mt-4 text-xs text-neutral-500">Calculated CO₂ is a supplier-based estimate: total distance × supplier CO₂ g/km ÷ 1000. It is not measured emissions or a lifecycle estimate.</p>
    <footer className="mt-5 flex justify-end gap-2 border-t border-neutral-100 pt-4"><button className={buttonClass} onClick={() => { onClose(); onOpenVehicle(row.registrationNumber); }}>Open vehicle</button><button className={buttonClass} onClick={onClose}>Close</button></footer>
  </VehicleDialog>;
}

export function StatisticsDirectory({ onOpenVehicle }: { onOpenVehicle: (plate: string) => void }) {
  const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TripRow | null>(null);
  const statistics = useStatistics(query, page);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(normalizePlate(search)); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  return <>
    <section className="rounded-xl border border-neutral-100 bg-white p-4">
      <h2 className="mb-2 font-headline text-base font-semibold text-neutral-900">Statistics directory</h2>
      <p className="mb-4 text-xs text-neutral-500">Reporting-period rows, newest first. Repeated plates and overlapping periods remain separate; totals are not summed across rows.</p>
      <label className="mb-4 block w-full max-w-xs text-xs text-neutral-600"><span className="mb-1.5 block font-medium">Statistics registration number search</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><input className={`${inputClass} pl-9`} placeholder="Search a plate…" value={search} onChange={event => setSearch(event.target.value)} /></div></label>
      {statistics.isLoading && <p role="status" className="py-8 text-center text-neutral-500">Loading statistics…</p>}
      <ErrorNotice error={statistics.error} />
      {statistics.isError && <button className={`${buttonClass} mt-3`} onClick={() => void statistics.refetch()}>Retry loading statistics</button>}
      {statistics.data && <>
        {statistics.data.items.length ? <StatisticsTable rows={statistics.data.items} onSelect={setSelected} /> : <p className="py-10 text-center text-sm text-neutral-500">No matching statistics rows. Add statistics or clear the search.</p>}
        <div className="-mx-4 -mb-4 rounded-b-xl bg-neutral-50 px-4 pb-3"><Paging page={page} total={statistics.data.total} pageSize={25} onChange={setPage} /></div>
      </>}
    </section>
    {selected && <StatisticsRowDetails row={selected} onClose={() => setSelected(null)} onOpenVehicle={onOpenVehicle} />}
  </>;
}
