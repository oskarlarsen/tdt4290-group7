import type { Snapshot } from "../../types/vehicle";
import { codeLabel, timestamp, vehicleDate } from "../../utils/vehicle";
import { buttonClass } from "./VehicleDialog";

export function RegistryStatistics({ snapshot, refreshFailed = false, busy = false, onRefresh }: {
  snapshot: Snapshot | null; refreshFailed?: boolean; busy?: boolean; onRefresh?: () => void;
}) {
  const data = snapshot?.data;
  return <section aria-label="Kjøretøydata (Statens vegvesen)" className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Kjøretøydata (Statens vegvesen)</h3>
        {snapshot && <p className="mt-1 text-xs text-neutral-500">Hentet {timestamp(snapshot.fetchedAt)}</p>}
      </div>
      {onRefresh && <button className={buttonClass} disabled={busy} onClick={onRefresh}>{busy ? "Oppdaterer…" : "Oppdater kjøretøydata"}</button>}
    </div>
    {refreshFailed && <p role="status" className="text-sm text-amber-900">Statens vegvesen kunne ikke oppdateres. {snapshot ? "De lagrede dataene under kan være utdaterte." : "Prøv igjen."}</p>}
    {!data ? <p className="text-sm text-neutral-500">Ingen kjøretøydata er hentet fra Statens vegvesen ennå.</p> : <>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[["Registreringsnummer", data.registrationNumber], ["Registreringsstatus", data.registrationStatus],
          ["Merke", data.make], ["Modell", data.model], ["Kjøretøykategori", codeLabel(data.vehicleCategory)],
          ["Karosseritype", codeLabel(data.bodyType)], ["Euroklasse", codeLabel(data.euroClass)],
          ["Sist godkjente EU-kontroll", data.lastApprovedInspectionDate ? vehicleDate(data.lastApprovedInspectionDate) : null],
          ["Neste EU-kontroll innen", data.nextInspectionDueDate ? vehicleDate(data.nextInspectionDueDate) : null],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 font-medium">{value ?? "Ikke tilgjengelig"}</dd></div>)}
      </dl>
      {data.fuels.map((fuel, index) => <div key={index} className="space-y-2 border-t border-neutral-200 pt-3">
        <p className="text-sm font-medium">Drivstoff: {codeLabel(fuel.fuelTechnology)}</p>
        {fuel.measurements.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="py-2 pr-4 font-medium">Målemetode</th><th scope="col" className="pr-4 font-medium">Statens vegvesens CO₂-utslipp (g/km)</th><th scope="col" className="font-medium">Statens vegvesens NOx-utslipp (mg/km)</th></tr></thead>
          <tbody>{fuel.measurements.map((measurement, measurementIndex) => <tr key={measurementIndex} className="border-t border-neutral-100">
            <td className="py-2 pr-4">{codeLabel(measurement.measurementMethod)}</td><td className="pr-4">{measurement.co2GramsPerKm ?? "Ikke tilgjengelig"}</td><td>{measurement.noxMgPerKm ?? "Ikke tilgjengelig"}</td>
          </tr>)}</tbody>
        </table></div> : <p className="text-sm text-neutral-500">Ingen utslippsmålinger oppgitt.</p>}
      </div>)}
    </>}
  </section>;
}
