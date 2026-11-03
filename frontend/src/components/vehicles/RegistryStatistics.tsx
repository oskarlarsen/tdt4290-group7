import type { Snapshot } from "../../types/vehicle";
import { codeLabel, timestamp, vehicleDate } from "../../utils/vehicle";
import { buttonClass } from "./VehicleDialog";

export function RegistryStatistics({ snapshot, refreshFailed = false, busy = false, onRefresh }: {
  snapshot: Snapshot | null; refreshFailed?: boolean; busy?: boolean; onRefresh?: () => void;
}) {
  const data = snapshot?.data;
  return <section aria-label="Vehicle data (Statens vegvesen)" className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Vehicle data (Statens vegvesen)</h3>
        {snapshot && <p className="mt-1 text-xs text-neutral-500">Retrieved {timestamp(snapshot.fetchedAt)}</p>}
      </div>
      {onRefresh && <button className={buttonClass} disabled={busy} onClick={onRefresh}>{busy ? "Refreshing…" : "Refresh vehicle data"}</button>}
    </div>
    {refreshFailed && <p role="status" className="text-sm text-amber-900">Statens vegvesen could not be refreshed. {snapshot ? "The saved data below may be outdated." : "Try again."}</p>}
    {!data ? <p className="text-sm text-neutral-500">No vehicle data retrieved from Statens vegvesen yet.</p> : <>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[["Registration number", data.registrationNumber], ["Registration status", data.registrationStatus],
          ["Brand", data.make], ["Model", data.model], ["Vehicle category", codeLabel(data.vehicleCategory)],
          ["Body type", codeLabel(data.bodyType)], ["Euro class", codeLabel(data.euroClass)],
          ["Last approved EU inspection", data.lastApprovedInspectionDate ? vehicleDate(data.lastApprovedInspectionDate) : null],
          ["Next EU inspection due", data.nextInspectionDueDate ? vehicleDate(data.nextInspectionDueDate) : null],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 font-medium">{value ?? "Not available"}</dd></div>)}
      </dl>
      {data.fuels.map((fuel, index) => <div key={index} className="space-y-2 border-t border-neutral-200 pt-3">
        <p className="text-sm font-medium">Fuel: {codeLabel(fuel.fuelTechnology)}</p>
        {fuel.measurements.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="py-2 pr-4 font-medium">Measurement method</th><th scope="col" className="pr-4 font-medium">Statens vegvesen CO₂ rate (g/km)</th><th scope="col" className="font-medium">Statens vegvesen NOx rate (mg/km)</th></tr></thead>
          <tbody>{fuel.measurements.map((measurement, measurementIndex) => <tr key={measurementIndex} className="border-t border-neutral-100">
            <td className="py-2 pr-4">{codeLabel(measurement.measurementMethod)}</td><td className="pr-4">{measurement.co2GramsPerKm ?? "Not available"}</td><td>{measurement.noxMgPerKm ?? "Not available"}</td>
          </tr>)}</tbody>
        </table></div> : <p className="text-sm text-neutral-500">No emission measurements provided.</p>}
      </div>)}
    </>}
  </section>;
}
