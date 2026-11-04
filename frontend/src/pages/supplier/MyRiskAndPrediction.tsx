import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, ShieldAlert } from "lucide-react";
import { RiskBadge } from "../../components/ui/RiskBadge";

export default function MyRiskAndPrediction() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { indicators, raw } = data;
  const certificates = raw.certificates || [];

  // Basic prediction: list certificates expiring in the next 90 days to show "projection" without scores
  const now = new Date();
  const upcomingExpiries = certificates.filter(c => {
      if (!c.validUntil) return false;
      const validUntilDate = new Date(c.validUntil);
      const daysUntilExpiry = Math.ceil((validUntilDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      return daysUntilExpiry > 0 && daysUntilExpiry <= 90;
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Risk & Prediction</h1>

      <section className="rounded-xl border border-neutral-100 bg-white p-6">
         <h2 className="text-lg font-medium text-neutral-900 mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-neutral-500" />
            Current Risk Indicators
         </h2>
         <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
            <div className="mb-2">
               {indicators?.risk ? <RiskBadge level={indicators.risk} /> : <span className="text-sm text-neutral-500">Unassessed</span>}
            </div>
            <p className="text-sm text-neutral-800">{indicators?.mainIssue || "No active risk indicators."}</p>
         </div>
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white p-6">
         <h2 className="text-lg font-medium text-neutral-900 mb-4">Projected Expiries (90 Days)</h2>
         {upcomingExpiries.length > 0 ? (
             <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-lg overflow-hidden">
                {upcomingExpiries.map(cert => (
                    <li key={cert.id} className="p-4 bg-white flex justify-between items-center">
                       <span className="text-sm font-medium text-neutral-900 uppercase tracking-wide">{cert.standard}</span>
                       <span className="text-sm text-amber-700 font-medium">Expiring: {cert.validUntil}</span>
                    </li>
                ))}
             </ul>
         ) : (
             <div className="py-6 text-center text-sm text-neutral-500 border border-neutral-100 rounded-lg bg-neutral-50">
                No certificates projected to expire in the next 90 days.
             </div>
         )}
      </section>
    </div>
  );
}