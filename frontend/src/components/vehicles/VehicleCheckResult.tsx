import type { RegistryData, VehicleCheck } from "../../types/vehicle";
import { APPROVAL_LABELS, checkLabel, codeLabel, humanize, summaryOf, timestamp } from "../../utils/vehicle";
import { FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../../utils/vehicleCatalog";

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
    <p className="text-xs text-neutral-500">Statens Vegvesen NOx uses mg/km. Supplier total NOx uses grams over its reported distance. No environmental comparisons are performed yet.</p>
  </section>;
}

export function VehicleCheckResult({ check, historical }: { check: VehicleCheck; historical: boolean }) {
  const summary = summaryOf(check);
  return <div className="space-y-5">
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="font-semibold">{historical ? "Historical check" : "Latest saved check"}: {checkLabel(summary)}</h3>
      <p className="mt-1 text-sm text-neutral-600">Checked {timestamp(check.checkedAt)}. Approval at that time: {APPROVAL_LABELS[check.approvalStatus]}.</p>
      <p className="mt-2 text-xs text-neutral-500">This is saved evidence, not a live status. Later statistics and approval changes do not alter it.</p>
    </div>
    {check.deviations.length > 0 && <section><h3 className="font-semibold">Recorded deviations</h3><ul className="mt-2 list-inside list-disc text-sm text-red-800">{check.deviations.map(code => <li key={code} className="capitalize">{humanize(code)}</li>)}</ul></section>}
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-neutral-500">Statens Vegvesen data source</dt><dd className="capitalize">{humanize(check.registry.dataSource)}</dd></div>
      <div><dt className="text-neutral-500">Lookup outcome</dt><dd className="capitalize">{humanize(check.registry.lookupOutcome)}</dd></div>
      <div><dt className="text-neutral-500">Statens Vegvesen retrieved</dt><dd>{timestamp(check.registry.fetchedAt)}</dd></div>
      <div><dt className="text-neutral-500">Statistics included</dt><dd>{check.tripRows.length} reporting rows</dd></div>
    </dl>
    {(check.registry.dataSource === "STALE_CACHE" || check.registry.dataSource === "UNAVAILABLE") && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {check.registry.dataSource === "STALE_CACHE" ? `The refresh failed (${humanize(check.registry.refreshFailure ?? "unknown")}). Older Statens Vegvesen information is shown; it may be outdated.` : `Registry verification is incomplete (${humanize(check.registry.lookupOutcome)}). This does not prove the vehicle is registered or compliant.`}
    </p>}
    <p className="text-xs text-neutral-600">Usage prohibition (bruksforbud) is unknown: this Statens Vegvesen endpoint cannot establish it. “No recorded deviations” does not mean every possible issue was checked.</p>
    {check.registry.data && <RegistryDetails data={check.registry.data} />}
    <details className="rounded-lg border border-neutral-200 p-3"><summary className="cursor-pointer text-sm font-medium">Approval evidence saved with this check</summary>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt>Approval ID</dt><dd className="break-all text-neutral-600">{check.approval?.id ?? "No approval recorded"}</dd></div>
        <div><dt>Approved fuel technology</dt><dd>{catalogLabel(FUEL_TECHNOLOGIES, check.approval?.data.fuelTechnology)}</dd></div>
        <div><dt>Approved vehicle category</dt><dd>{catalogLabel(VEHICLE_CATEGORIES, check.approval?.data.vehicleCategory)}</dd></div>
        <div><dt>Start</dt><dd>{check.approval?.data.startDate ?? (check.approval ? "Immediate" : "Not applicable")}</dd></div>
        <div><dt>Expiry</dt><dd>{check.approval?.data.expiryDate ?? (check.approval ? "Indefinite" : "Not applicable")}</dd></div>
        <div><dt>Revoked</dt><dd>{timestamp(check.approval?.revokedAt)}</dd></div>
      </dl>
    </details>
    {historical && <details className="rounded-lg border border-neutral-200 p-3"><summary className="cursor-pointer text-sm font-medium">Statistics included at check time ({check.tripRows.length})</summary>
      <div className="mt-3 space-y-2">{check.tripRows.map(row => <div key={row.id} className="text-sm">{row.data.periodStart} – {row.data.periodEnd} · {row.data.totalTripKm} km · Estimated CO₂: {row.estimatedCo2Kg == null ? "Not applicable" : `${row.estimatedCo2Kg} kg`}</div>)}</div>
    </details>}
  </div>;
}
