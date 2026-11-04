import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Zap } from "lucide-react";
import { formatNumber } from "../../utils/formatNumber";

export default function MyEnergy() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { summaries, raw } = data;
  const eState = summaries.energy.state;
  const req = raw.energy.requirement;
  const rec = raw.energy.record;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Energy & Fuel</h1>

      {eState === "not-applicable" ? (
         <div className="py-12 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            Energy reporting is not applicable to your contract.
         </div>
      ) : eState === "data-missing" ? (
         <div className="py-12 flex flex-col items-center justify-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            <Zap className="h-8 w-8 text-neutral-300 mb-3" />
            <p>No energy data submitted for the current period.</p>
            {req && <p className="mt-2 text-xs">Target: {req.minRenewableSharePercent}% renewable energy</p>}
         </div>
      ) : (
        <section className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
           <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4">
              <h2 className="font-headline text-lg font-semibold text-neutral-900 flex items-center gap-2">
                 <Zap className="h-5 w-5 text-amber-500" />
                 Latest Reporting Period
              </h2>
           </div>

           <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                 <div>
                   <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Contract Requirement</h3>
                   <p className="mt-1 text-2xl font-semibold text-neutral-900">{req?.minRenewableSharePercent}% <span className="text-sm font-normal text-neutral-500">renewable minimum</span></p>
                 </div>

                 <div>
                   <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Actual Performance</h3>
                   <div className="mt-1 flex items-baseline gap-2">
                      <p className={`text-3xl font-semibold ${summaries.energy.isBreach ? 'text-red-600' : 'text-green-600'}`}>
                         {summaries.energy.renewableSharePercent}%
                      </p>
                      <span className="text-sm text-neutral-500">renewable achieved</span>
                   </div>
                 </div>
              </div>

              <div className="bg-neutral-50 p-5 rounded-lg border border-neutral-100">
                 <h3 className="text-xs font-medium text-neutral-900 uppercase tracking-wide mb-4">Consumption Breakdown</h3>
                 <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                       <span className="text-neutral-600">Electric</span>
                       <span className="font-medium text-neutral-900">{formatNumber(rec?.consumptionKwh.electric || 0)} kWh</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-neutral-600">Biogas</span>
                       <span className="font-medium text-neutral-900">{formatNumber(rec?.consumptionKwh.biogas || 0)} kWh</span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-neutral-200">
                       <span className="text-neutral-600">Fossil</span>
                       <span className="font-medium text-neutral-900">{formatNumber(rec?.consumptionKwh.fossil || 0)} kWh</span>
                    </div>
                 </div>
              </div>
           </div>
        </section>
      )}
    </div>
  );
}