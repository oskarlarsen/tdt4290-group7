import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Bell } from "lucide-react";

export default function MyAlerts() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { alerts } = data;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Alerts</h1>

      <section className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
        {alerts.length > 0 ? (
          <div className="divide-y divide-neutral-100">
             {alerts.map(alert => (
                <div key={alert.id} className="p-5 hover:bg-neutral-50/50 transition-colors">
                   <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium text-neutral-900">{alert.title}</h3>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${alert.severity === 'high' ? 'bg-red-50 text-red-700' : alert.severity === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                         {alert.severity}
                      </span>
                   </div>
                   <p className="text-sm text-neutral-600 mb-3">{alert.description}</p>
                   <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> {alert.timeAgo}</span>
                      {alert.status && <span className="uppercase tracking-wide font-medium bg-neutral-100 px-2 py-0.5 rounded">{alert.status.replace("_", " ")}</span>}
                   </div>
                </div>
             ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500">
             No active alerts.
          </div>
        )}
      </section>
    </div>
  );
}