import type { VehicleCheck } from "../../types/vehicle";
import { useState } from "react";
import { buttonClass, inputClass } from "./VehicleDialog";
import { DeviationFacts } from "./DeviationFacts";
import { analyzeDeviation } from "../../utils/deviationAnalysis";
import { timestamp, vehicleDate } from "../../utils/vehicle";

export function DeviationList({ check, onViewRow }: { check: VehicleCheck; onViewRow?: (id: string) => void }) {
  const [rowFilter, setRowFilter] = useState("");
  const findings = check.findings.filter(f => !rowFilter || f.tripRowId === rowFilter || f.relatedTripRowId === rowFilter);
  return <section className="space-y-3">
    {check.tripRows.length > 1 && <label className="block max-w-sm text-xs text-neutral-600">Rapporteringsperiode<select className={`${inputClass} mt-1`} value={rowFilter} onChange={e => setRowFilter(e.target.value)}><option value="">Alle perioder</option>{check.tripRows.map(r => <option key={r.id} value={r.id}>{vehicleDate(r.data.periodStart)} - {vehicleDate(r.data.periodEnd)}</option>)}</select></label>}
    {!findings.length && <p className="text-sm text-neutral-500">{check.findings.length ? "Ingen avvik for denne perioden." : "Ingen avvik registrert."}</p>}
    <ul className="space-y-3">{findings.map((finding, index) => {
      const row = check.tripRows.find(r => r.id === finding.tripRowId);
      const analysis = analyzeDeviation(finding, check);
      return <li key={index} className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">{analysis.title}</h3>
        <p className="mt-1 text-xs text-neutral-500">{finding.origin === "REGISTRY" ? "Sammenlignet med Statens vegvesen" : finding.origin === "AGREEMENT" ? "Sammenlignet med leverandøravtalen" : "Leverandørens rapporterte tall"}{row ? ` · ${vehicleDate(row.data.periodStart)} - ${vehicleDate(row.data.periodEnd)}` : ""}</p>
        <DeviationFacts finding={finding} check={check} />
        {row && onViewRow && <button className={`${buttonClass} mt-3`} onClick={() => onViewRow(row.id)}>Vis rapporteringsperiode</button>}
      </li>;
    })}</ul>
  </section>;
}

export function VehicleCheckResult({ check, historical, onViewRow }: { check: VehicleCheck; historical: boolean; onViewRow?: (id: string) => void }) {
  return <div className="space-y-4">
    <p className="text-xs text-neutral-500">{historical ? "Tidligere sjekk" : "Sjekket"} {timestamp(check.checkedAt)}</p>
    {(check.registry.dataSource === "STALE_CACHE" || check.registry.dataSource === "UNAVAILABLE") && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{check.registry.dataSource === "STALE_CACHE" ? "Oppdatering fra Statens vegvesen mislyktes; sammenligningene bruker eldre data." : "Statens vegvesen er utilgjengelig; registersammenligningene er ufullstendige."}</p>}
    <DeviationList check={check} onViewRow={onViewRow} />
    <details className="rounded-xl border border-neutral-200 p-4"><summary className="cursor-pointer text-sm font-medium">Sjekkdetaljer</summary>
      <div className="mt-4 space-y-4 text-sm">
        <p>Hentet fra Statens vegvesen: {timestamp(check.registry.fetchedAt)}</p>
        {check.agreement && <p>Leverandøravtale: {check.agreement.supplier.name}, {vehicleDate(check.agreement.agreement.startDate)} - {vehicleDate(check.agreement.agreement.endDate)}</p>}
        <p className="text-xs text-neutral-500">Lagrede resultater beholder opplysningene som ble brukt ved sjekken. En sjekk kan ikke fastslå bruksforbud eller at alt er uten avvik.</p>
      </div>
    </details>
  </div>;
}
