import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Zap } from "lucide-react";
import { formatNumber } from "../../utils/formatNumber";

export default function MyEnergy() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const records = data.energy;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Energy & Fuel</h1>

      {records.length === 0 ? (
         <div className="py-12 flex flex-col items-center justify-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            <Zap className="h-8 w-8 text-neutral-300 mb-3" />
            <p>No energy records are stored for your organization.</p>
         </div>
      ) : (
         <div className="space-y-4">
           {records.map((record) => <section key={record.id} className="rounded-xl border border-neutral-100 bg-white p-5">
             <div className="flex flex-wrap items-start justify-between gap-2">
               <div><h2 className="font-headline text-lg font-semibold text-neutral-900">{record.locationCode}</h2><p className="text-sm text-neutral-500">{record.address}</p></div>
               <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm">Reporting year {record.reportingYear}</span>
             </div>
             <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
               <div><dt className="text-neutral-500">Electricity</dt><dd className="font-medium">{formatNumber(record.electricityKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">District heating</dt><dd className="font-medium">{formatNumber(record.districtHeatingKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Biogas</dt><dd className="font-medium">{formatNumber(record.biogasKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Fossil fuel</dt><dd className="font-medium">{formatNumber(record.fossilFuelKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Self-produced solar</dt><dd className="font-medium">{formatNumber(record.selfProducedSolarKwh)} kWh</dd></div>
               <div><dt className="text-neutral-500">Self-produced heat pump</dt><dd className="font-medium">{formatNumber(record.selfProducedHeatpumpKwh)} kWh</dd></div>
             </dl>
             {record.notes && <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-600">{record.notes}</p>}
           </section>)}
           <p className="text-sm text-neutral-500">Energy targets are not yet stored with agreements, so this page reports submitted consumption without showing a compliance score.</p>
         </div>
      )}
    </div>
  );
}