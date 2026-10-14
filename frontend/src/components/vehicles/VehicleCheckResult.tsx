import type { RegistryData, VehicleCheck } from "../../types/vehicle";
import { useState } from "react";
import { ApprovalPeriods } from "./ApprovalPeriods";
import { buttonClass, inputClass } from "./VehicleDialog";
import { DeviationFacts } from "./DeviationFacts";
import { analyzeDeviation } from "../../utils/deviationAnalysis";
import { APPROVAL_LABELS, checkLabel, codeLabel, humanize, summaryOf, timestamp } from "../../utils/vehicle";

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
  const [priority, setPriority] = useState("");
  const [rowFilter, setRowFilter] = useState("");
  const allFindings = check.findings ?? [];
  const rowIds = new Set(allFindings.flatMap(f => [f.tripRowId, f.relatedTripRowId]).filter(Boolean));
  const findings = allFindings.filter(f => (!priority || f.priority === priority) && (!rowFilter || (rowFilter === "vehicle" ? !f.tripRowId && !f.relatedTripRowId : f.tripRowId === rowFilter || f.relatedTripRowId === rowFilter)));
  return <section className="space-y-3"><h3 className="font-semibold">Recorded deviations</h3>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs text-neutral-600">Deviation priority<select className={`${inputClass} mt-1`} value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option><option value="HIGH">High</option><option value="MODERATE">Moderate</option></select></label>
      <label className="block text-xs text-neutral-600">Reporting row<select className={`${inputClass} mt-1`} value={rowFilter} onChange={e => setRowFilter(e.target.value)}><option value="">All rows and vehicle-level deviations</option><option value="vehicle">Vehicle / approval level only</option>{check.tripRows.map((r, index) => rowIds.has(r.id) ? <option key={r.id} value={r.id}>Row {index + 1}: {r.data.periodStart} — {r.data.periodEnd}</option> : null)}</select></label>
    </div>
    <p className="text-xs text-neutral-500">Showing {findings.length} of {allFindings.length} deviations.</p>
    {!findings.length && <p className="text-sm text-neutral-500">{allFindings.length ? "No deviations match these filters." : "No deviations were recorded in this saved check. This is not a guarantee of complete verification."}</p>}
    <ul className="space-y-3">{findings.map((finding, index) => {
      const row = check.tripRows.find(r => r.id === finding.tripRowId);
      const reference = finding.fuelIndex == null ? null : check.registry.data?.fuels[finding.fuelIndex];
      const method = finding.measurementIndex == null ? null : reference?.measurements[finding.measurementIndex]?.measurementMethod;
      const analysis = analyzeDeviation(finding, check);
      return <li key={index} className={`rounded-lg border p-3 ${finding.priority === "HIGH" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-white/70 px-2 py-0.5 text-xs font-semibold">{finding.priority === "HIGH" ? "High priority" : "Moderate priority"}</span><h4 className="text-sm font-medium">{analysis.title}</h4></div>
        <p className="mt-2 break-words text-sm">{analysis.explanation}</p>
        <p className="mt-2 text-xs text-neutral-600">Source: {finding.origin === "REGISTRY" ? "Statens Vegvesen comparison" : humanize(finding.origin)}{row ? ` · Reporting period ${row.data.periodStart} — ${row.data.periodEnd}` : ""}{method ? ` · Method ${codeLabel(method)}` : ""}</p>
        {finding.approvalId && <p className="mt-1 break-all text-xs text-neutral-500">Approval: {finding.approvalId}{finding.relatedApprovalId ? ` · Conflicts with ${finding.relatedApprovalId}` : ""}</p>}
        <DeviationFacts finding={finding} check={check} />
        {row && onViewRow && <button className={`${buttonClass} mt-2`} onClick={() => onViewRow(row.id)}>View statistics row</button>}
      </li>;
    })}</ul>
  </section>;
}

export function VehicleCheckResult({ check, historical, onViewRow, onAnalyzeDeviations }: { check: VehicleCheck; historical: boolean; onViewRow?: (id: string) => void; onAnalyzeDeviations?: () => void }) {
  const summary = summaryOf(check);
  return <div className="space-y-5">
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="font-semibold">{historical ? "Historical check" : "Latest saved check"}: {checkLabel(summary)}</h3>
      <p className="mt-1 text-sm text-neutral-600">Checked {timestamp(check.checkedAt)}. Approval at that time: {APPROVAL_LABELS[check.approvalStatus]}.</p>
      <p className="mt-2 text-xs text-neutral-500">This is saved evidence, not a live status. Later statistics and approval changes do not alter it.</p>
    </div>
    {(check.findings ?? []).length > 0 && (onAnalyzeDeviations ? <button className={buttonClass} onClick={onAnalyzeDeviations}>Analyze deviations</button> : <DeviationList check={check} onViewRow={onViewRow} />)}
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
      <div className="mt-3"><ApprovalPeriods approvals={check.approvals} /></div>
    </details>
    {historical && <details className="rounded-lg border border-neutral-200 p-3"><summary className="cursor-pointer text-sm font-medium">Statistics included at check time ({check.tripRows.length})</summary>
      <div className="mt-3 space-y-2">{check.tripRows.map(row => <div key={row.id} className="text-sm">{row.data.periodStart} – {row.data.periodEnd} · {row.data.totalTripKm} km · Estimated CO₂: {row.estimatedCo2Kg == null ? "Not applicable" : `${row.estimatedCo2Kg} kg`}</div>)}</div>
    </details>}
  </div>;
}
