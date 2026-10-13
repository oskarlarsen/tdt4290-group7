import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck, Info, Plus, Search } from "lucide-react";
import { useRefreshVehicles, useVehicles } from "../../hooks/useVehicles";
import type { ApprovalStatus } from "../../types/vehicle";
import { APPROVAL_LABELS, normalizePlate } from "../../utils/vehicle";
import { VehicleTable } from "../../components/vehicles/VehicleTable";
import { VehicleDetailsDrawer } from "../../components/vehicles/VehicleDetailsDrawer";
import { ApprovalForm, CheckForm, StatisticsForm } from "../../components/vehicles/VehicleForms";
import { ErrorNotice, Paging, buttonClass, primaryClass } from "../../components/vehicles/VehicleDialog";

const filterClass = "w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10";

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
  return <div className="space-y-4 p-4">
    <header className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">Municipal Oversight</p>
          <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">Vehicles</h1>
          <p className="mt-1.5 max-w-[680px] text-sm leading-6 text-[#5c6773]">Manage approvals, reporting-period statistics and explicit registry checks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className={buttonClass} onClick={() => setForm("check")}><Search className="h-3.5 w-3.5" />Check a plate</button>
          <button className={buttonClass} onClick={() => setForm("approval")}><ClipboardCheck className="h-3.5 w-3.5" />Approve vehicle</button>
          <button className={primaryClass} onClick={() => setForm("statistics")}><Plus className="h-3.5 w-3.5" />Add statistics</button>
        </div>
      </div>
    </header>
    {notice && <p role="status" className="rounded-lg border border-tertiary-200 bg-tertiary-50 p-3 text-sm text-tertiary-700">{notice}</p>}
    <div className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-white p-4 text-xs leading-5 text-neutral-500"><Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" /><p>Approval and SVV verification are separate. No recorded deviations is not a guarantee of compliance. Browsing does not call SVV. Vehicle API authorization is still pending; this draft is for local development.</p></div>
    <section className="rounded-xl border border-neutral-100 bg-white p-4">
      <h2 className="mb-3 font-headline text-base font-semibold text-neutral-900">Vehicle directory</h2>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><label className="block w-full max-w-xs text-xs text-neutral-600"><span className="mb-1.5 block font-medium">Registration number search</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><input className={`${filterClass} pl-9`} maxLength={12} placeholder="Search a plate…" value={search} onChange={e => setSearch(e.target.value)} /></div></label>
        <label className="block text-xs text-neutral-600"><span className="mb-1.5 block font-medium">Current approval</span><select className={filterClass} value={status} onChange={e => { setStatus(e.target.value as ApprovalStatus | ""); setPage(1); }}><option value="">All approval statuses</option>{Object.entries(APPROVAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {vehicles.isLoading && <p role="status" className="py-8 text-center text-neutral-500">Loading vehicles…</p>}
      <ErrorNotice error={vehicles.error} />
      {vehicles.isError && <button className={`${buttonClass} mt-3`} onClick={() => void vehicles.refetch()}>Retry loading</button>}
      {vehicles.data && <>
        <p className="mb-4 text-xs text-neutral-400">Current approval as of {vehicles.data.approvalAsOf} (Oslo). Check findings are historical.</p>
        {vehicles.data.items.length ? <VehicleTable items={vehicles.data.items} onOpen={open} /> : <div className="py-10 text-center"><p className="font-medium">{vehicles.data.total ? "No vehicles on this page" : "No matching vehicles"}</p><p className="mt-2 text-sm text-neutral-500">Clear the filters, add statistics, approve a vehicle, or explicitly check a plate.</p></div>}
        <div className="-mx-4 -mb-4 rounded-b-xl bg-neutral-50 px-4 pb-3"><Paging page={page} total={vehicles.data.total} pageSize={25} onChange={setPage} /></div>
      </>}
    </section>
    {plate && <VehicleDetailsDrawer key={plate} plate={plate} onClose={() => setParams({})} />}
    {form === "statistics" && <StatisticsForm onClose={() => setForm(null)} onSaved={saved} />}
    {form === "approval" && <ApprovalForm onClose={() => setForm(null)} onSaved={saved} />}
    {form === "check" && <CheckForm onClose={() => setForm(null)} onSaved={saved} />}
  </div>;
}
