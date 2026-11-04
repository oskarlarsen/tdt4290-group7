import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { RiskBadge } from "../../components/ui/RiskBadge";

export default function MyCompliance() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { indicators } = data;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Compliance</h1>
      <section className="rounded-xl border border-neutral-100 bg-white p-6">
         <div className="flex items-start gap-4">
            <div className="mt-1">
               {indicators?.risk === "compliant" ? <CheckCircle2 className="h-6 w-6 text-green-500" /> : <AlertTriangle className="h-6 w-6 text-amber-500" />}
            </div>
            <div>
               <h2 className="text-lg font-medium text-neutral-900 mb-2">Compliance Status</h2>
               <div className="mb-4">
                  {indicators?.risk ? <RiskBadge level={indicators.risk} /> : <span className="text-sm text-neutral-500">Unassessed</span>}
               </div>
               <div>
                  <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Primary Indicator</h3>
                  <p className="mt-1 text-sm text-neutral-800">{indicators?.mainIssue || "No specific issues identified."}</p>
               </div>
            </div>
         </div>
      </section>
    </div>
  );
}