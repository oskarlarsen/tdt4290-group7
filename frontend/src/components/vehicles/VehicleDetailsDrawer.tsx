import { useState } from "react";
import type { StoredApproval } from "../../types/vehicle";
import { ApprovalPeriods } from "./ApprovalPeriods";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel, statisticNotApplicable } from "../../utils/vehicleCatalog";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { useVehicle, useVehicleCheck, useVehicleHistory, useRefreshVehicles } from "../../hooks/useVehicles";
import { APPROVAL_LABELS, DECIMAL_FIELDS, checkLabel, humanize, summaryOf, timestamp } from "../../utils/vehicle";
import { ApprovalBadge } from "./VehicleTable";
import { ApprovalForm, StatisticsForm } from "./VehicleForms";
import { DeviationList, VehicleCheckResult } from "./VehicleCheckResult";
import { VehicleDialog, ErrorNotice, Paging, buttonClass, primaryClass, dangerClass, inputClass, checkboxClass } from "./VehicleDialog";

export function VehicleDetailsDrawer({ plate, onClose }: { plate: string; onClose: () => void }) {
  const detail = useVehicle(plate);
  const [tab, setTab] = useState("Overview");
  const [form, setForm] = useState<"statistics" | "approval" | null>(null);
  const [editingApproval, setEditingApproval] = useState<StoredApproval | null>(null);
  const [revokingApproval, setRevokingApproval] = useState<StoredApproval | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [revokeConfirmation, setRevokeConfirmation] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const history = useVehicleHistory(plate, historyPage);
  const check = useVehicleCheck(selectedCheck ?? detail.data?.latestCheck?.id);
  const refresh = useRefreshVehicles();
  const run = useMutation({ mutationFn: () => api.runCheck(plate, forceRefresh), retry: false, onSuccess: result => {
    setSelectedCheck(result.id); setTab("Deviations"); setNotice("New check saved. Review its compared facts and Statens Vegvesen availability below."); void refresh();
  } });
  const revoke = useMutation({ mutationFn: () => api.revokeApproval(revokingApproval!.id), retry: false, onSuccess: () => {
    setRevokeConfirmation(null); setNotice("Approval revoked. Previous checks remain unchanged."); void refresh();
  } });
  const busy = run.isPending || revoke.isPending;
  function saved(_: string, message: string) { setForm(null); setNotice(message); void refresh(); }
  const data = detail.data;
  return <>
    <VehicleDialog title={`Vehicle ${plate}`} drawer onClose={onClose} busy={busy}>
      {notice && <p role="status" className="mb-4 rounded-lg border border-tertiary-200 bg-tertiary-50 p-3 text-sm text-tertiary-700">{notice}</p>}
      {detail.isLoading && <p role="status">Loading vehicle…</p>}
      <ErrorNotice error={detail.error} />
      {detail.isError && <button className={`${buttonClass} mt-3`} onClick={() => void detail.refetch()}>Retry loading</button>}
      {data && <>
        <div className="flex flex-wrap items-center gap-3"><ApprovalBadge status={data.approvalStatus} /><span className="text-xs text-neutral-500">Approval as of {data.approvalAsOf} (Oslo)</span></div>
        <div className="my-4 flex flex-wrap gap-2">
          <button className={primaryClass} disabled={busy} onClick={() => { setNotice(""); run.mutate(); }}>{run.isPending ? "Checking…" : "Run check"}</button>
          <button className={buttonClass} disabled={busy} onClick={() => setForm("statistics")}>Add statistics</button>
          <button className={buttonClass} disabled={busy} onClick={() => { setEditingApproval(null); setForm("approval"); }}>Add approval period</button>
        </div>
        <details className="mb-5 text-sm"><summary className="cursor-pointer text-neutral-600">Check options</summary>
          <label className="mt-2 flex gap-2"><input type="checkbox" className={checkboxClass} checked={forceRefresh} disabled={busy} onChange={e => setForceRefresh(e.target.checked)} />Force new Statens Vegvesen lookup. Otherwise a recent successful snapshot is reused.</label>
        </details>
        <ErrorNotice error={run.error} />
        <div role="tablist" aria-label="Vehicle information" className="my-5 flex flex-wrap gap-1 border-b border-neutral-100">
          {["Overview", "Statistics", "Deviations", "Check result", "History"].map((name, index, tabs) => <button key={name} role="tab" tabIndex={tab === name ? 0 : -1} id={`vehicle-tab-${name.replace(/ /g, "-")}`} aria-selected={tab === name} aria-controls="vehicle-tab-panel" onClick={() => setTab(name)} onKeyDown={event => {
            let next: number | undefined;
            if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
            if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = tabs.length - 1;
            if (next !== undefined) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`vehicle-tab-${tabs[next].replace(/ /g, "-")}`)?.focus(); }
          }} className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 ${tab === name ? "border-primary-900 text-primary-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>{name}</button>)}
        </div>
        <div id="vehicle-tab-panel" role="tabpanel" aria-labelledby={`vehicle-tab-${tab.replace(/ /g, "-")}`}>
        {tab === "Overview" && <div className="space-y-5">
          <section><h3 className="font-semibold">Current approval</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {[["Status", APPROVAL_LABELS[data.approvalStatus]], ["Approved fuel technology", catalogLabel(FUEL_TECHNOLOGIES, data.approval?.data.fuelTechnology)],
                ["Vehicle category", catalogLabel(VEHICLE_CATEGORIES, data.approval?.data.vehicleCategory)], ["Source", data.approval?.sourceName ?? "Not provided"],
                ["Start date", data.approval ? data.approval.data.startDate ?? "Immediate" : "Not applicable"],
                ["Expiry date", data.approval ? data.approval.data.expiryDate ?? "Indefinite" : "Not applicable"]].map(([label, value]) => <div key={label}><dt className="text-neutral-500">{label}</dt><dd>{value}</dd></div>)}
            </dl>
            {data.approval?.revokedAt && <p className="mt-3 text-sm text-amber-900">Revoked {timestamp(data.approval.revokedAt)}. Reapproval creates a new record.</p>}
          </section>
          <ApprovalPeriods approvals={data.approvals} busy={busy}
            onEdit={a => { setEditingApproval(a); setForm("approval"); }}
            onRevoke={a => { revoke.reset(); setRevokingApproval(a); setRevokeConfirmation(""); }} />
          <section className="rounded-lg bg-neutral-50 p-4"><h3 className="font-semibold">Latest recorded check</h3><p className="mt-2 text-sm">{checkLabel(data.latestCheck)}</p><p className="mt-1 text-xs text-neutral-500">{timestamp(data.latestCheck?.checkedAt)}. A saved check may predate changes to approval or statistics.</p></section>
          <p className="text-sm text-neutral-600">{data.tripRows.length} reporting rows are stored. Reporting rows may overlap; totals are deliberately not summed.</p>
        </div>}
        {tab === "Statistics" && <div className="space-y-3">
          <p className="text-sm text-neutral-600">Supplier observations—not approval requirements or Statens Vegvesen measurements. Blank values are not treated as zero. Rows are append-only.</p>
          {!data.tripRows.length && <p className="rounded-lg bg-neutral-50 p-4 text-sm">No statistics yet. Use Add statistics to enter a reporting period.</p>}
          {data.tripRows.map(row => <details key={row.id} open={selectedRow === row.id || undefined} className="rounded-lg border border-neutral-200 p-4"><summary className="cursor-pointer text-sm font-medium">{row.data.periodStart} – {row.data.periodEnd} · {row.data.totalTripKm} km · Total CO₂ (calculated): {row.estimatedCo2Kg == null ? "Not applicable" : `${row.estimatedCo2Kg} kg`}</summary>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[["Source", row.sourceName], ["Fuel technology", catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology)], ["Vehicle brand", row.data.make], ["Vehicle model", row.data.model],
                ["Vehicle category", catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory)], ["Body type", catalogLabel(BODY_TYPES, row.data.bodyType)],
                ["Registered as CO₂-emitting", row.data.co2Registered == null ? "Not provided" : row.data.co2Registered ? "Yes" : "No"],
                ...DECIMAL_FIELDS.map(([key, label]) => [label, statisticNotApplicable(key, row.data.fuelTechnology) ? "Not applicable" : row.data[key]]), ["Job/trip count", row.data.tripCount], ["Comment", row.data.comment], ["Added", timestamp(row.createdAt)], ["Row ID", row.id]].map(([label, value]) => <div key={String(label)}><dt className="text-neutral-500">{label}</dt><dd className="break-words">{value ?? "Not provided"}</dd></div>)}
            </dl>
            <p className="mt-3 text-xs text-neutral-500">Total CO₂ (calculated) = supplier total distance × supplier CO₂ g/km ÷ 1000. This read-only value is an estimate, not measured emissions.</p>
          </details>)}
        </div>}
        {tab === "Deviations" && <div className="space-y-4">
          {check.isLoading && <p role="status">Loading saved deviations…</p>}<ErrorNotice error={check.error} />
          {check.isError && <button className={buttonClass} onClick={() => void check.refetch()}>Retry loading deviations</button>}
          {check.data && <>
            <div className="rounded-lg bg-neutral-50 p-4"><h3 className="font-semibold">{checkLabel(summaryOf(check.data))}</h3>
              <p className="mt-1 text-sm text-neutral-600">Saved check from {timestamp(check.data.checkedAt)}. Expand Compare facts to see what differs. Later changes do not rewrite this evidence.</p></div>
            {!Array.isArray(check.data.findings) ? <p role="status" className="text-sm text-amber-900">Detailed evidence is unavailable for this saved check. Restart the updated backend and run a new check to capture compared facts.</p> : <DeviationList check={check.data} onViewRow={id => { setSelectedRow(id); setTab("Statistics"); }} />}
          </>}
          {!data.latestCheck && !selectedCheck && <p className="text-sm text-neutral-500">No saved check yet. Run check to evaluate the stored reporting rows.</p>}
        </div>}
        {tab === "Check result" && <>
          {check.isLoading && <p role="status">Loading saved check…</p>}<ErrorNotice error={check.error} />
          {check.isError && <button className={buttonClass} onClick={() => void check.refetch()}>Retry loading check</button>}
          {check.data && <VehicleCheckResult check={check.data} historical={check.data.id !== data.latestCheck?.id}
            onAnalyzeDeviations={() => setTab("Deviations")}
            onViewRow={id => { setSelectedRow(id); setTab("Statistics"); }} />}
          {!data.latestCheck && !selectedCheck && <p>No check recorded. Run a check explicitly to verify this vehicle.</p>}
        </>}
        {tab === "History" && <>
          <p className="mb-4 text-sm text-neutral-600">Previous results are retained indefinitely. Selecting one only reads saved evidence; it does not rerun the check.</p>
          {history.isLoading && <p role="status">Loading history…</p>}<ErrorNotice error={history.error} />
          {history.isError && <button className={buttonClass} onClick={() => void history.refetch()}>Retry loading history</button>}
          {history.data && <><div className="space-y-2">{history.data.items.map(item => <button key={item.id} onClick={() => { setSelectedCheck(item.id); setTab("Check result"); }} className="block w-full rounded-lg border border-neutral-200 p-4 text-left hover:bg-neutral-50">
            <p className="text-sm font-medium">{timestamp(item.checkedAt)} · {checkLabel(item)}</p><p className="mt-1 text-xs text-neutral-500">Approval then: {APPROVAL_LABELS[item.approvalStatus]} · Statens Vegvesen: {humanize(item.dataSource)}</p>
          </button>)}</div>{!history.data.items.length && <p>No saved checks.</p>}<Paging page={historyPage} total={history.data.total} pageSize={10} onChange={setHistoryPage} /></>}
        </>}
        </div>
      </>}
    </VehicleDialog>
    {form === "statistics" && data && <StatisticsForm plate={plate} existingRows={data.tripRows} onClose={() => setForm(null)} onSaved={saved} />}
    {form === "approval" && data && <ApprovalForm key={editingApproval?.id ?? "new"} plate={plate} approval={editingApproval} onClose={() => setForm(null)} onSaved={saved} />}
    {revokeConfirmation !== null && <VehicleDialog title="Revoke vehicle approval" busy={revoke.isPending} onClose={() => setRevokeConfirmation(null)}>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (revokeConfirmation === plate) revoke.mutate(); }}>
        <p className="text-sm">Revoke this approval period for <strong>{plate}</strong>: {revokingApproval?.data.startDate} — {revokingApproval?.data.expiryDate ?? "Indefinite"}. Other approval periods remain unchanged. Earlier covered days and previous checks remain stored.</p>
        <label className="block text-sm">Type {plate} to confirm<input autoFocus required disabled={revoke.isPending} className={`${inputClass} mt-2 font-mono`} value={revokeConfirmation} onChange={e => setRevokeConfirmation(e.target.value)} /></label>
        <ErrorNotice error={revoke.error} /><button disabled={revokeConfirmation !== plate || revoke.isPending} className={dangerClass}>{revoke.isPending ? "Revoking…" : "Confirm revocation"}</button>
      </form>
    </VehicleDialog>}
  </>;
}
