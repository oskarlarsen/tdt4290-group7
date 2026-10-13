import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Truck } from "lucide-react";
import { useRefreshVehicles, useVehicles } from "../../hooks/useVehicles";
import type { ApprovalStatus } from "../../types/vehicle";
import { APPROVAL_LABELS, normalizePlate } from "../../utils/vehicle";
import { VehicleTable } from "../../components/vehicles/VehicleTable";
import { VehicleDetailsDrawer } from "../../components/vehicles/VehicleDetailsDrawer";
import { ApprovalForm, CheckForm, StatisticsForm } from "../../components/vehicles/VehicleForms";
import { ErrorNotice, Paging, buttonClass, inputClass } from "../../components/vehicles/VehicleDialog";

export default function Vehicles() {
  const [search, setSearch] = useState(""); const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ApprovalStatus | "">(""); const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams(); const plate = params.get("plate");
  const [form, setForm] = useState<"statistics" | "approval" | "check" | null>(null);
  const [notice, setNotice] = useState("");
  const vehicles = useVehicles(query, status, page); const refresh = useRefreshVehicles();
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(normalizePlate(search)); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  function open(plate: string) { setParams({ plate }); }
  function saved(plate: string, message: string) { setForm(null); setNotice(message); setPage(1); void refresh(); open(plate); }
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary-900" /><h1 className="font-headline text-2xl font-semibold">Vehicles</h1></div><p className="mt-2 text-sm text-neutral-500">Manage approvals, reporting-period statistics and explicit registry checks.</p></div>
      <div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={() => setForm("statistics")}>Add statistics</button><button className={buttonClass} onClick={() => setForm("approval")}>Approve vehicle</button><button className={buttonClass} onClick={() => setForm("check")}>Check a plate</button></div>
    </header>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <p className="rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600">Approval and SVV verification are separate. No recorded deviations is not a guarantee of compliance. Browsing does not call SVV. Vehicle API authorization is still pending; this draft is for local development.</p>
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4"><label className="block w-full max-w-sm text-sm"><span className="mb-1 block font-medium">Registration number search</span><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input className={`${inputClass} pl-9`} maxLength={12} placeholder="Search a plate…" value={search} onChange={e => setSearch(e.target.value)} /></div></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">Current approval</span><select className={inputClass} value={status} onChange={e => { setStatus(e.target.value as ApprovalStatus | ""); setPage(1); }}><option value="">All approval statuses</option>{Object.entries(APPROVAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {vehicles.isLoading && <p role="status" className="py-8 text-center text-neutral-500">Loading vehicles…</p>}
      <ErrorNotice error={vehicles.error} />
      {vehicles.isError && <button className={`${buttonClass} mt-3`} onClick={() => void vehicles.refetch()}>Retry loading</button>}
      {vehicles.data && <>
        <p className="mb-2 text-xs text-neutral-500">Current approval as of {vehicles.data.approvalAsOf} (Oslo). Check findings are historical.</p>
        {vehicles.data.items.length ? <VehicleTable items={vehicles.data.items} onOpen={open} /> : <div className="py-10 text-center"><p className="font-medium">{vehicles.data.total ? "No vehicles on this page" : "No matching vehicles"}</p><p className="mt-2 text-sm text-neutral-500">Clear the filters, add statistics, approve a vehicle, or explicitly check a plate.</p></div>}
        <Paging page={page} total={vehicles.data.total} pageSize={25} onChange={setPage} />
      </>}
    </section>
    {plate && <VehicleDetailsDrawer key={plate} plate={plate} onClose={() => setParams({})} />}
    {form === "statistics" && <StatisticsForm onClose={() => setForm(null)} onSaved={saved} />}
    {form === "approval" && <ApprovalForm onClose={() => setForm(null)} onSaved={saved} />}
    {form === "check" && <CheckForm onClose={() => setForm(null)} onSaved={saved} />}
  </div>;
}
