import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMyEnergySummary } from "../../api/energy";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ENERGY_STATUS_LABELS, ENERGY_STATUS_TONES, currentReportingYear, formatKwh, formatSignedKwh } from "../../types/energy";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Zap } from "lucide-react";
import { formatNumber } from "../../utils/formatNumber";
import { EnergyEvidencePanel } from "../../components/supplier/EnergyEvidencePanel";

export default function MyEnergy() {
  const { data, isLoading, isError, error } = useMySupplierOverview();
  const year = currentReportingYear();
  const commitments = useQuery({ queryKey: ["my-energy-summary", year], queryFn: () => getMyEnergySummary(year) });

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Kunne ikke laste data"}</div>;

  // Newest report first: year, then quarter, then location.
  const records = [...data.energy].sort((a, b) => b.reportingYear - a.reportingYear || b.reportingQuarter - a.reportingQuarter || a.locationCode.localeCompare(b.locationCode));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">Energi</h1>
        <Link
          to="/supplier/onboarding?entity=energy"
          className="inline-flex h-9 items-center rounded-lg bg-primary-900 px-3 text-sm font-medium text-white hover:bg-primary-700"
        >
          Rapporter eller oppdater et kvartal
        </Link>
      </div>

      {commitments.data && commitments.data.length > 0 && (
        <section aria-label={`Forpliktelser for ${year}`} className="space-y-3">
          <h2 className="font-headline text-lg font-semibold text-neutral-900">Dine forpliktelser for {year}</h2>
          {commitments.data.map((row) => (
            <div key={row.agreementId} className="rounded-xl border border-neutral-100 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-neutral-900">{row.saksnr ?? "Avtale"}</p>
                <StatusBadge status={ENERGY_STATUS_TONES[row.status]} label={ENERGY_STATUS_LABELS[row.status]} />
              </div>
              {row.commitment ? (
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-neutral-500">Egenprodusert fornybar energi</dt>
                    <dd className="font-medium">{formatKwh(row.selfProducedKwh)} levert av {formatKwh(row.commitment.minSelfProducedKwh)} lovet</dd>
                    {row.selfProducedDeviationKwh !== null && <dd className={`text-xs ${row.selfProducedDeviationKwh < 0 ? "text-red-700" : "text-tertiary-700"}`}>{row.status === "COMPLIANT" || row.status === "NON_COMPLIANT" ? "" : "Anslått "}{formatSignedKwh(row.selfProducedDeviationKwh)} mot forpliktelsen</dd>}
                  </div>
                  <div>
                    <dt className="text-neutral-500">Dekket av opprinnelsesgarantier (GoO)</dt>
                    <dd className="font-medium">{formatKwh(row.gooCoveredKwh)} levert av {formatKwh(row.commitment.minGooKwh)} lovet</dd>
                    {row.gooDeviationKwh !== null && <dd className={`text-xs ${row.gooDeviationKwh < 0 ? "text-red-700" : "text-tertiary-700"}`}>{row.status === "COMPLIANT" || row.status === "NON_COMPLIANT" ? "" : "Anslått "}{formatSignedKwh(row.gooDeviationKwh)} mot forpliktelsen</dd>}
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">Kommunen har ikke registrert en forpliktelse for denne avtalen ennå.</p>
              )}
            </div>
          ))}
        </section>
      )}

      {records.length === 0 ? (
         <div className="py-12 flex flex-col items-center justify-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            <Zap className="h-8 w-8 text-neutral-300 mb-3" />
            <p>Ingen energirapporter er lagret for organisasjonen din.</p>
         </div>
      ) : (
         <div className="space-y-4">
           {records.map((record) => <section key={record.id} className="rounded-xl border border-neutral-100 bg-white p-5">
             <div className="flex flex-wrap items-start justify-between gap-2">
               <div><h2 className="font-headline text-lg font-semibold text-neutral-900">{record.locationCode}</h2><p className="text-sm text-neutral-500">{record.address}</p></div>
               <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">{record.reportingYear} · Q{record.reportingQuarter}</span>
             </div>
             <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
               <div><dt className="text-neutral-500">Strøm</dt><dd className="font-medium">{formatNumber(record.electricityKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Fjernvarme</dt><dd className="font-medium">{formatNumber(record.districtHeatingKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Biogass</dt><dd className="font-medium">{formatNumber(record.biogasKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Fossilt brensel</dt><dd className="font-medium">{formatNumber(record.fossilFuelKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Egenprodusert sol</dt><dd className="font-medium">{formatNumber(record.selfProducedSolarKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Egenprodusert varmepumpe</dt><dd className="font-medium">{formatNumber(record.selfProducedHeatpumpKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Dekket av opprinnelsesgarantier (GoO)</dt><dd className="font-medium">{formatNumber(record.gooCoveredKwh)} kWh</dd></div>
             </dl>
             {record.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-600">{record.notes}</p>}
           </section>)}
           <p className="text-sm text-neutral-500">Forpliktelser settes av kommunen. Postene over er det du har sendt inn.</p>
         </div>
      )}

      <EnergyEvidencePanel agreements={data.agreements.filter((agreement) => agreement.requiresEnergy)} />
    </div>
  );
}