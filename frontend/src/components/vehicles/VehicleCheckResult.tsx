import type { RegistryData, VehicleCheck } from "../../types/vehicle";
import { useState } from "react";
import { buttonClass, inputClass } from "./VehicleDialog";
import { DeviationFacts } from "./DeviationFacts";
import { analyzeDeviation } from "../../utils/deviationAnalysis";
import { codeLabel, timestamp, vehicleDate } from "../../utils/vehicle";

export function RegistryDetails({ data }: { data: RegistryData }) {
  return <section className="space-y-3">
    <h3 className="font-semibold">Selected Statens Vegvesen observations</h3>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {[["Registration status", data.registrationStatus], ["Vehicle brand", data.make], ["Vehicle model", data.model],
        ["Vehicle category", codeLabel(data.vehicleCategory)], ["Body type", codeLabel(data.bodyType)], ["Euro class", codeLabel(data.euroClass)]].map(([label, value]) =>
        <div key={label}><dt className="text-neutral-500">{label}</dt><dd className="font-medium">{value ?? "Not provided"}</dd></div>)}
    </dl>
    {data.fuels.map((fuel, fuelIndex) => <div key={fuelIndex} className="rounded-lg border border-neutral-200 p-3">
      <p className="text-sm font-medium">Statens Vegvesen fuel technology: {codeLabel(fuel.fuelTechnology)}</p>
      {fuel.measurements.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col">Measurement method</th><th scope="col">CO₂ (g/km)</th><th scope="col">NOx (mg/km)</th></tr></thead>
        <tbody>{fuel.measurements.map((measurement, index) => <tr key={index} className="border-t border-neutral-100"><td className="py-2">{codeLabel(measurement.measurementMethod)}</td><td>{measurement.co2GramsPerKm ?? "Not provided"}</td><td>{measurement.noxMgPerKm ?? "Not provided"}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-neutral-500">No emission measurements provided.</p>}
    </div>)}
    {!data.fuels.length && <p className="text-sm text-neutral-500">No fuel/emission observations provided.</p>}
    <p className="text-xs text-neutral-500">Statens Vegvesen NOx uses mg/km. Supplier grams are converted using the NOx-registered distance. Every relevant measurement is compared after nearest-integer rounding; different methods and reporting scopes may explain discrepancies.</p>
  </section>;
}

export function DeviationList({ check, onViewRow }: { check: VehicleCheck; onViewRow?: (id: string) => void }) {
  const [rowFilter, setRowFilter] = useState("");
  const findings = check.findings.filter(f => !rowFilter || f.tripRowId === rowFilter || f.relatedTripRowId === rowFilter);
  return <section className="space-y-3">
    {check.tripRows.length > 1 && <label className="block max-w-sm text-xs text-neutral-600">Reporting period<select className={`${inputClass} mt-1`} value={rowFilter} onChange={e => setRowFilter(e.target.value)}><option value="">All periods</option>{check.tripRows.map(r => <option key={r.id} value={r.id}>{vehicleDate(r.data.periodStart)} - {vehicleDate(r.data.periodEnd)}</option>)}</select></label>}
    {!findings.length && <p className="text-sm text-neutral-500">{check.findings.length ? "No deviations for this period." : "No deviations recorded."}</p>}
    <ul className="space-y-3">{findings.map((finding, index) => {
      const row = check.tripRows.find(r => r.id === finding.tripRowId);
      const analysis = analyzeDeviation(finding, check);
      return <li key={index} className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">{analysis.title}</h3>
        <p className="mt-1 text-xs text-neutral-500">{finding.origin === "REGISTRY" ? "Compared with Statens Vegvesen" : finding.origin === "AGREEMENT" ? "Compared with supplier agreement" : "Supplier reporting figures"}{row ? ` · ${vehicleDate(row.data.periodStart)} - ${vehicleDate(row.data.periodEnd)}` : ""}</p>
        <DeviationFacts finding={finding} check={check} />
        {row && onViewRow && <button className={`${buttonClass} mt-3`} onClick={() => onViewRow(row.id)}>View reporting period</button>}
      </li>;
    })}</ul>
  </section>;
}

export function VehicleCheckResult({ check, historical, onViewRow }: { check: VehicleCheck; historical: boolean; onViewRow?: (id: string) => void }) {
  return <div className="space-y-4">
    <p className="text-xs text-neutral-500">{historical ? "Historical check" : "Checked"} {timestamp(check.checkedAt)}</p>
    {(check.registry.dataSource === "STALE_CACHE" || check.registry.dataSource === "UNAVAILABLE") && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{check.registry.dataSource === "STALE_CACHE" ? "Statens Vegvesen refresh failed; comparisons use older data." : "Statens Vegvesen is unavailable; registry comparisons are incomplete."}</p>}
    <DeviationList check={check} onViewRow={onViewRow} />
    <details className="rounded-xl border border-neutral-200 p-4"><summary className="cursor-pointer text-sm font-medium">Check details</summary>
      <div className="mt-4 space-y-4 text-sm">
        <p>Statens Vegvesen retrieved: {timestamp(check.registry.fetchedAt)}</p>
        {check.registry.data && <RegistryDetails data={check.registry.data} />}
        {check.agreement && <p>Supplier agreement: {check.agreement.supplier.name}, {vehicleDate(check.agreement.agreement.startDate)} - {vehicleDate(check.agreement.agreement.endDate)}</p>}
        <p className="text-xs text-neutral-500">Saved results retain the facts used at check time. A check cannot establish usage prohibition or complete compliance.</p>
      </div>
    </details>
  </div>;
}
