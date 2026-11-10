import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { useVehicle, useVehicleCheck, useVehicleHistory, useRefreshVehicles } from "../../hooks/useVehicles";
import { timestamp, vehicleDate, checkLabel } from "../../utils/vehicle";
import { StatisticsForm } from "./VehicleForms";
import { StatisticsCard } from "./StatisticsCard";
import { RegistryStatistics } from "./RegistryStatistics";
import { VehicleCheckResult } from "./VehicleCheckResult";
import { VehicleDialog, ErrorNotice, Paging, buttonClass, primaryClass } from "./VehicleDialog";

export function VehicleDetails({ plate, agreementId, onClose }: { plate: string; agreementId?: string | null; onClose: () => void }) {
  const detail = useVehicle(plate, agreementId);
  const [tab, setTab] = useState("Statistics");
  const [addingStatistics, setAddingStatistics] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const history = useVehicleHistory(plate, historyPage);
  const check = useVehicleCheck(selectedCheck ?? detail.data?.latestCheck?.id);
  const refresh = useRefreshVehicles();
  const run = useMutation({ mutationFn: (forceRefresh: boolean) => api.runCheck(plate, forceRefresh, agreementId), retry: false, onSuccess: (result, forceRefresh) => {
    setSelectedCheck(result.id); if (!forceRefresh) setTab("Deviations"); void refresh();
  } });
  const data = detail.data;
  return <>
    <VehicleDialog title={plate} wide onClose={onClose} busy={run.isPending}>
      {detail.isLoading && <p role="status">Loading vehicle…</p>}
      <ErrorNotice error={detail.error ?? run.error} />
      {detail.isError && <button className={buttonClass} onClick={() => void detail.refetch()}>Try again</button>}
      {notice && <p role="status" className="mb-4 text-sm text-neutral-600">{notice}</p>}
      {data && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm"><p className="font-medium">{data.agreement?.supplier.name ?? "No agreement linked"}</p>
            {data.agreement && <p className="mt-1 text-xs text-neutral-500">{data.agreement.agreement.saksnr ? `${data.agreement.agreement.saksnr} · ` : ""}{vehicleDate(data.agreement.agreement.startDate)} – {vehicleDate(data.agreement.agreement.endDate)}</p>}
            {!data.vehicle.listed && <p className="mt-1 text-xs text-red-700">Not in the agreement’s current vehicle list</p>}
          </div>
          <div className="flex gap-2"><button className={buttonClass} onClick={() => setAddingStatistics(true)}>Add reported data</button><button className={primaryClass} disabled={run.isPending} onClick={() => run.mutate(false)}>{run.isPending ? "Checking…" : "Check for deviations"}</button></div>
        </div>
        <div role="tablist" aria-label="Vehicle information" className="flex gap-1 border-b border-neutral-200">
          {["Statistics", "Deviations", "History"].map((name, index, tabs) => <button key={name} role="tab" id={`vehicle-tab-${name}`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1} aria-controls="vehicle-panel" onClick={() => setTab(name)} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (next !== null) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`vehicle-tab-${tabs[next]}`)?.focus(); }
          }} className={`border-b-2 px-3 py-2 text-sm focus-visible:outline-primary-700 ${tab === name ? "border-primary-900 font-medium text-primary-900" : "border-transparent text-neutral-500"}`}>{name}</button>)}
        </div>
        <div id="vehicle-panel" role="tabpanel" aria-labelledby={`vehicle-tab-${tab}`} className="space-y-4">
          {tab === "Statistics" && <>
            <RegistryStatistics snapshot={data.latestSnapshot} busy={run.isPending} onRefresh={() => run.mutate(true)}
              refreshFailed={!!data.latestCheck && (!data.latestSnapshot || data.latestCheck.checkedAt >= data.latestSnapshot.fetchedAt) && ["STALE_CACHE", "UNAVAILABLE"].includes(data.latestCheck.dataSource)} />
            <section aria-label="Reported data" className="space-y-4"><h3 className="text-sm font-semibold">Reported data</h3>
              {data.tripRows.map(row => <StatisticsCard key={row.id} row={row} highlight={row.id === selectedRow} />)}
              {!data.tripRows.length && <p className="text-sm text-neutral-500">No reported data yet.</p>}
            </section>
          </>}
          {tab === "Deviations" && <>
            {check.isLoading && <p role="status">Loading check…</p>}<ErrorNotice error={check.error} />
            {check.data && <VehicleCheckResult check={check.data} historical={check.data.id !== data.latestCheck?.id} onViewRow={id => { setSelectedRow(id); setTab("Statistics"); }} />}
            {!data.latestCheck && !selectedCheck && <p className="text-sm text-neutral-500">Run a check to compare this vehicle with the agreement and Statens vegvesen.</p>}
          </>}
          {tab === "History" && <>
            {history.isLoading && <p role="status">Loading previous checks…</p>}<ErrorNotice error={history.error} />
            {history.data && <><ul className="divide-y divide-neutral-100">{history.data.items.map(item => <li key={item.id}><button className="w-full rounded-lg px-3 py-3 text-left text-sm hover:bg-neutral-50" onClick={() => { setSelectedCheck(item.id); setTab("Deviations"); }}><span className="font-medium">{timestamp(item.checkedAt)}</span><span className="ml-3 text-neutral-500">{checkLabel(item)}</span></button></li>)}</ul>
              {!history.data.items.length && <p className="text-sm text-neutral-500">No previous checks.</p>}
              <Paging page={historyPage} total={history.data.total} pageSize={10} onChange={setHistoryPage} /></>}
          </>}
        </div>
      </div>}
    </VehicleDialog>
    {addingStatistics && data && <StatisticsForm plate={plate} existingRows={data.tripRows} onClose={() => setAddingStatistics(false)} onSaved={(_, message) => { setAddingStatistics(false); setNotice(message); void refresh(); }} />}
  </>;
}
