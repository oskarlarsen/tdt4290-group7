import { useAuth } from "../../hooks/useAuth";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, AlertCircle, FileText, Truck, Zap, Bell, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { RiskBadge } from "../../components/ui/RiskBadge";
import { KpiCard } from "../../components/ui/KpiCard";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        {error instanceof Error ? error.message : "Couldn't load your supplier overview. Please try again!"}
      </div>
    );
  }

  const { supplier, contract, indicators, requiredActions, summaries, alerts } = data;

  const getEnergyText = () => {
    if (summaries.energy.state === "not-applicable") return "Not applicable";
    if (summaries.energy.state === "data-missing") return "Data not submitted";
    return `${summaries.energy.renewableSharePercent}% renewable (target: ${summaries.energy.minRenewableSharePercent}%)`;
  };

  const getEnergyTone = () => {
    if (summaries.energy.state !== "normal") return "text-neutral-500";
    return summaries.energy.isBreach ? "text-red-700" : "text-neutral-900";
  };

  // KPI calculations
  const totalCertsNeedingAttention = summaries.certificates.missing + summaries.certificates.expired + summaries.certificates.expiring;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-headline text-2xl font-semibold text-neutral-900">
              Supplier / Dashboard
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {supplier?.name || "Unknown Supplier"}
              {supplier?.orgId ? ` · Org: ${supplier.orgId}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
             <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                Demo Data
             </span>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Required Actions"
          value={requiredActions.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          noteTone={requiredActions.length > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label="Certificates"
          value={totalCertsNeedingAttention}
          sublabel="needing attention"
          icon={<FileText className="h-4 w-4" />}
          noteTone={totalCertsNeedingAttention > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label="Flagged Vehicles"
          value={summaries.vehicles.flagged}
          icon={<Truck className="h-4 w-4" />}
          noteTone={summaries.vehicles.flagged > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label="Active Alerts"
          value={alerts.length}
          icon={<Bell className="h-4 w-4" />}
          noteTone={alerts.length > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">

          {/* Overall Status Card */}
          <section className="rounded-xl border border-neutral-100 bg-white p-4">
            <h2 className="font-headline text-base font-semibold text-neutral-900 mb-3">Overall Status</h2>
            <div className="flex items-start gap-4">
               <div>
                 {indicators?.risk ? <RiskBadge level={indicators.risk} /> : <span className="text-sm text-neutral-500">No indicators</span>}
               </div>
               <div>
                  <p className="text-sm font-medium text-neutral-800">
                     {indicators?.risk === "compliant" ? "Compliant with monitored requirements" : "Requires attention"}
                  </p>
                  {indicators?.mainIssue && (
                    <p className="text-sm text-neutral-600 mt-1">{indicators.mainIssue}</p>
                  )}
               </div>
            </div>
          </section>

          {/* Required Actions */}
          <section className="rounded-xl border border-neutral-100 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-headline text-base font-semibold text-neutral-900">Required Actions</h2>
              <span className="inline-flex items-center justify-center bg-neutral-100 text-neutral-600 text-xs font-semibold px-2 py-1 rounded-full">
                {requiredActions.length}
              </span>
            </div>

            {requiredActions.length > 0 ? (
               <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-lg overflow-hidden">
                 {requiredActions.map((action, idx) => (
                   <li key={idx}>
                     <Link to={action.link} className="flex items-center justify-between p-3 hover:bg-neutral-50 transition-colors group">
                       <div>
                         <p className="text-sm font-medium text-neutral-800 group-hover:text-neutral-900">{action.title}</p>
                         <p className="text-xs text-neutral-500">{action.reason}</p>
                       </div>
                       <ArrowRight className="h-4 w-4 text-neutral-300 group-hover:text-primary-600 transition-transform group-hover:translate-x-1" />
                     </Link>
                   </li>
                 ))}
               </ul>
             ) : (
                <div className="py-6 text-center text-sm text-neutral-500 border border-neutral-100 rounded-lg bg-neutral-50">
                  No required actions at this time.
                </div>
             )}
          </section>

          {/* Summaries Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
             <div className="rounded-xl border border-neutral-100 bg-white p-4">
                <h3 className="font-semibold text-sm text-neutral-900 mb-2">Certificates</h3>
                <div className="space-y-1.5 text-sm">
                   <div className="flex justify-between"><span className="text-neutral-500">Valid</span><span className="font-medium">{summaries.certificates.valid}</span></div>
                   <div className="flex justify-between"><span className="text-neutral-500">Expiring</span><span className={`font-medium ${summaries.certificates.expiring > 0 ? 'text-amber-600' : ''}`}>{summaries.certificates.expiring}</span></div>
                   <div className="flex justify-between"><span className="text-neutral-500">Expired</span><span className={`font-medium ${summaries.certificates.expired > 0 ? 'text-red-600' : ''}`}>{summaries.certificates.expired}</span></div>
                   <div className="flex justify-between border-t border-neutral-100 pt-1.5 mt-1.5"><span className="text-neutral-500">Missing</span><span className={`font-medium ${summaries.certificates.missing > 0 ? 'text-amber-600' : ''}`}>{summaries.certificates.missing}</span></div>
                </div>
             </div>

             <div className="rounded-xl border border-neutral-100 bg-white p-4">
                <h3 className="font-semibold text-sm text-neutral-900 mb-2">Vehicles</h3>
                <div className="space-y-1.5 text-sm">
                   {summaries.vehicles.state === "not-applicable" ? (
                      <div className="text-neutral-500">Not applicable</div>
                   ) : summaries.vehicles.state === "data-missing" ? (
                      <div className="text-neutral-500">Data not submitted</div>
                   ) : (
                     <>
                       <div className="flex justify-between"><span className="text-neutral-500">Tracked</span><span className="font-medium">{summaries.vehicles.tracked}</span></div>
                       <div className="flex justify-between border-t border-neutral-100 pt-1.5 mt-1.5"><span className="text-neutral-500">Flagged</span><span className={`font-medium ${summaries.vehicles.flagged > 0 ? 'text-amber-600' : ''}`}>{summaries.vehicles.flagged}</span></div>
                     </>
                   )}
                </div>
             </div>

             <div className="rounded-xl border border-neutral-100 bg-white p-4">
                <h3 className="font-semibold text-sm text-neutral-900 mb-2">Energy</h3>
                <div className="text-sm">
                   <span className={`font-medium ${getEnergyTone()}`}>{getEnergyText()}</span>
                </div>
             </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <section className="rounded-xl border border-neutral-100 bg-white p-4 h-full">
            <h2 className="font-headline text-base font-semibold text-neutral-900 mb-3">My Alerts</h2>
            <div className="space-y-3">
               {alerts.length > 0 ? (
                 alerts.map(alert => (
                    <div key={alert.id} className="p-3 border border-neutral-100 rounded-lg text-sm bg-neutral-50/50">
                       <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-neutral-900 line-clamp-1">{alert.title}</span>
                       </div>
                       <p className="text-neutral-500 text-xs line-clamp-2 mb-2">{alert.description}</p>
                       <div className="flex justify-between items-center text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${alert.severity === 'high' ? 'bg-red-50 text-red-700' : alert.severity === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{alert.severity}</span>
                          <span className="text-neutral-400">{alert.timeAgo}</span>
                       </div>
                    </div>
                 ))
               ) : (
                 <div className="py-8 text-center text-sm text-neutral-500">
                    No active alerts
                 </div>
               )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}