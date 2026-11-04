import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function RequiredActions() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { requiredActions } = data;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Required Actions</h1>

      <section className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
        {requiredActions.length > 0 ? (
          <ul className="divide-y divide-neutral-100">
             {requiredActions.map((action, idx) => (
                <li key={idx}>
                   <Link to={action.link} className="flex items-center justify-between p-5 hover:bg-neutral-50 transition-colors group">
                      <div className="flex gap-4">
                         <div className="mt-0.5">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                         </div>
                         <div>
                            <h3 className="text-base font-medium text-neutral-900 group-hover:text-primary-700 transition-colors">{action.title}</h3>
                            <p className="mt-1 text-sm text-neutral-500">Reason: {action.reason}</p>
                         </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-neutral-300 group-hover:text-primary-600 transition-transform group-hover:translate-x-1" />
                   </Link>
                </li>
             ))}
          </ul>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500">
             No required actions at this time. All compliance requirements are met.
          </div>
        )}
      </section>
    </div>
  );
}