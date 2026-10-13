import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { ApiError } from "../../api/client";
import type { StoredApproval, TripRow } from "../../types/vehicle";
import { DECIMAL_FIELDS, statisticsBody, validDate, validPlate } from "../../utils/vehicle";
import { VehicleDialog, Field, ErrorNotice, inputClass, buttonClass, primaryClass } from "./VehicleDialog";

type Props = { plate?: string; onClose: () => void; onSaved: (plate: string, message: string) => void };

async function existingVehicle(plate: string) {
  try { return await api.getVehicle(plate); } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

export function StatisticsForm({ plate, existingRows = [], onClose, onSaved }: Props & { existingRows?: TripRow[] }) {
  const [values, setValues] = useState<Record<string, string>>({ registrationNumber: plate ?? "", periodStart: "", periodEnd: "", co2Registered: "unknown" });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>();
  const [overlapAccepted, setOverlapAccepted] = useState(false);
  const [rows, setRows] = useState(existingRows);
  const [preparing, setPreparing] = useState(false);
  const save = useMutation({ mutationFn: api.appendStatistics, retry: false });
  const busy = preparing || save.isPending;
  const overlapping = rows.some(row => values.periodStart && values.periodEnd && row.data.periodStart <= values.periodEnd && row.data.periodEnd >= values.periodStart);
  function change(key: string, value: string) { setValues(current => ({ ...current, [key]: value })); setDirty(true); setError(undefined); setOverlapAccepted(false); if (key === "registrationNumber") setRows([]); }
  function close() { if (!busy && (!dirty || window.confirm("Discard the statistics you have entered?"))) onClose(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(undefined); setPreparing(true);
    try {
      const body = statisticsBody(values);
      const vehicle = await existingVehicle(validPlate(values.registrationNumber));
      const currentRows = vehicle?.tripRows ?? [];
      setRows(currentRows);
      const hasOverlap = currentRows.some(row => row.data.periodStart <= values.periodEnd && row.data.periodEnd >= values.periodStart);
      if (hasOverlap && !overlapAccepted) throw new Error("Confirm that you intend to append an overlapping reporting period.");
      await save.mutateAsync(body);
      onSaved(validPlate(values.registrationNumber), "Statistics appended. No approval or new check was created.");
    } catch (cause) { setError(cause); } finally { setPreparing(false); }
  }
  return <VehicleDialog title="Add vehicle statistics" onClose={close} busy={busy}>
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-neutral-600">One row describes a reporting period, not necessarily one trip. Saving always appends a new row; it never replaces statistics or approves the vehicle.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration number *"><input required autoFocus readOnly={!!plate} maxLength={12} className={inputClass} value={values.registrationNumber} onChange={e => change("registrationNumber", e.target.value)} /></Field>
        <Field label="Source / reference (optional)"><input className={inputClass} value={values.sourceName ?? ""} onChange={e => change("sourceName", e.target.value)} /></Field>
        <Field label="Period start *"><input type="date" required className={inputClass} value={values.periodStart} onChange={e => change("periodStart", e.target.value)} /></Field>
        <Field label="Period end *"><input type="date" required min={values.periodStart || undefined} className={inputClass} value={values.periodEnd} onChange={e => change("periodEnd", e.target.value)} /></Field>
        <Field label="Reported fuel technology"><input className={inputClass} value={values.fuelTechnology ?? ""} onChange={e => change("fuelTechnology", e.target.value)} /></Field>
        <Field label="Registered as CO₂-emitting"><select className={inputClass} value={values.co2Registered} onChange={e => change("co2Registered", e.target.value)}><option value="unknown">Not provided</option><option value="true">Yes</option><option value="false">No</option></select></Field>
        {DECIMAL_FIELDS.slice(0, 2).map(([key, label]) => <Field key={key} label={label}><input inputMode="decimal" className={inputClass} value={values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>)}
      </fieldset>
      <details className="rounded-lg border border-neutral-200 p-4"><summary className="cursor-pointer text-sm font-medium">Additional statistics (optional)</summary>
        <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
          {[["make", "Reported make"], ["model", "Reported model"], ["vehicleType", "Reported vehicle type"], ["assignmentNumber", "Assignment number"]].map(([key, label]) => <Field key={key} label={label}><input className={inputClass} value={values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>)}
          <Field label="Job/trip count"><input inputMode="numeric" className={inputClass} value={values.tripCount ?? ""} onChange={e => change("tripCount", e.target.value)} /></Field>
          {DECIMAL_FIELDS.slice(2).map(([key, label]) => <Field key={key} label={label}><input inputMode="decimal" className={inputClass} value={values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>)}
          <div className="sm:col-span-2"><Field label="Comment"><textarea className={inputClass} value={values.comment ?? ""} onChange={e => change("comment", e.target.value)} /></Field></div>
        </fieldset>
        <p className="mt-3 text-xs text-neutral-500">NOx grams relate to the NOx-covered distance. Median CO₂ is stored as reported; its interpretation is not assumed.</p>
      </details>
      <p className="text-xs text-neutral-500">Use a decimal point, e.g. 12.34. Blank means not provided; zero is stored as zero. Estimated CO₂ is calculated by the backend from total distance × supplier CO₂ / 1000, never entered manually.</p>
      {overlapping && <label className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><input type="checkbox" disabled={busy} checked={overlapAccepted} onChange={e => setOverlapAccepted(e.target.checked)} />This period overlaps existing statistics. I intend to append another row.</label>}
      <ErrorNotice error={error} />
      {!!error && <p className="text-xs text-neutral-600">If the connection failed after sending, close this form and inspect the vehicle’s statistics before resubmitting: the row may already have been saved.</p>}
      <footer className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={close}>Cancel</button><button className={primaryClass} disabled={busy || (overlapping && !overlapAccepted)}>{busy ? "Saving…" : "Append statistics"}</button></footer>
    </form>
  </VehicleDialog>;
}

export function ApprovalForm({ plate, approval, onClose, onSaved }: Props & { approval?: StoredApproval | null }) {
  // Revoked approvals are history; a subsequent approval starts a new record.
  const existing = approval && !approval.revokedAt ? approval : null;
  const [values, setValues] = useState({ registrationNumber: plate ?? "", fuelTechnology: existing?.data.fuelTechnology ?? "", vehicleGroup: existing?.data.vehicleGroup ?? "", sourceName: existing?.sourceName ?? "", startDate: existing?.data.startDate ?? "", expiryDate: existing?.data.expiryDate ?? "", usedThroughoutPeriod: existing?.data.usedThroughoutPeriod == null ? "unknown" : String(existing.data.usedThroughoutPeriod) });
  const [indefinite, setIndefinite] = useState(!existing?.data.expiryDate);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>();
  const [preparing, setPreparing] = useState(false);
  const save = useMutation({ mutationFn: (body: Parameters<typeof api.saveApproval>) => api.saveApproval(...body), retry: false });
  const busy = preparing || save.isPending;
  function change(key: keyof typeof values, value: string) { setValues(current => ({ ...current, [key]: value })); setDirty(true); setError(undefined); }
  function close() { if (!busy && (!dirty || window.confirm("Discard your approval changes?"))) onClose(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(undefined); setPreparing(true);
    try {
      const registrationNumber = validPlate(values.registrationNumber);
      if (values.startDate && !validDate(values.startDate)) throw new Error("Enter a valid approval start date.");
      if (!indefinite && !validDate(values.expiryDate)) throw new Error("Enter an expiry date or select indefinite approval.");
      if (!indefinite && values.startDate && values.expiryDate < values.startDate) throw new Error("Expiry cannot be before the start date.");
      const current = await existingVehicle(registrationNumber);
      const currentApproval = current?.approval;
      if (currentApproval && !currentApproval.revokedAt && (!existing || currentApproval.id !== existing.id || currentApproval.updatedAt !== existing.updatedAt))
        throw new Error("This vehicle already has an approval, or its approval has changed. Close this form and open the vehicle to edit its current approval without overwriting unseen fields.");
      if (existing && (!currentApproval || currentApproval.revokedAt)) throw new Error("This approval was revoked while you were editing. Close and reopen the vehicle to create a new approval.");
      await save.mutateAsync([{
        registrationNumber, fuelTechnology: values.fuelTechnology.trim() || null, vehicleGroup: values.vehicleGroup.trim() || null,
        startDate: values.startDate || null, expiryDate: indefinite ? null : values.expiryDate,
        usedThroughoutPeriod: values.usedThroughoutPeriod === "unknown" ? null : values.usedThroughoutPeriod === "true",
      }, values.sourceName.trim() || null]);
      onSaved(registrationNumber, "Approval saved. Previous check results are unchanged; run a new check to record the updated approval.");
    } catch (cause) { setError(cause); } finally { setPreparing(false); }
  }
  return <VehicleDialog title={existing ? "Edit vehicle approval" : "Approve vehicle"} onClose={close} busy={busy}>
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-neutral-600">Approval is separate from statistics. {existing ? "Saving replaces the current approval fields; clearing a field removes its value." : "Reapproving a revoked vehicle creates a new approval record."}</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration number *"><input autoFocus required readOnly={!!plate} className={inputClass} value={values.registrationNumber} onChange={e => change("registrationNumber", e.target.value)} /></Field>
        <Field label="Approved fuel technology"><input className={inputClass} value={values.fuelTechnology} onChange={e => change("fuelTechnology", e.target.value)} /></Field>
        <Field label="Vehicle group"><input className={inputClass} value={values.vehicleGroup} onChange={e => change("vehicleGroup", e.target.value)} /></Field>
        <Field label="Used throughout the approval-sheet period"><select className={inputClass} value={values.usedThroughoutPeriod} onChange={e => change("usedThroughoutPeriod", e.target.value)}><option value="unknown">Not provided</option><option value="true">Yes</option><option value="false">No</option></select></Field>
        <Field label="Start date (blank = immediate)"><input type="date" className={inputClass} value={values.startDate} onChange={e => change("startDate", e.target.value)} /></Field>
        <Field label="Source / reference"><input className={inputClass} value={values.sourceName} onChange={e => change("sourceName", e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={indefinite} onChange={e => { setIndefinite(e.target.checked); setDirty(true); }} />Approved indefinitely, until manually revoked</label>
        {!indefinite && <Field label="Expiry date * (inclusive)"><input required type="date" min={values.startDate || undefined} className={inputClass} value={values.expiryDate} onChange={e => change("expiryDate", e.target.value)} /></Field>}
      </fieldset>
      <ErrorNotice error={error} />
      <footer className="flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={close}>Cancel</button><button className={primaryClass} disabled={busy}>{busy ? "Saving…" : "Save approval"}</button></footer>
    </form>
  </VehicleDialog>;
}

export function CheckForm({ onClose, onSaved }: Props) {
  const [plate, setPlate] = useState(""); const [force, setForce] = useState(false); const [error, setError] = useState<unknown>();
  const check = useMutation({ mutationFn: () => api.runCheck(validPlate(plate), force), retry: false });
  async function submit(event: FormEvent) { event.preventDefault(); setError(undefined); try { const result = await check.mutateAsync(); onSaved(result.vehicle.registrationNumber, "Check saved. Open Check result to inspect the findings and SVV availability."); } catch (cause) { setError(cause); } }
  return <VehicleDialog title="Check a registration number" onClose={onClose} busy={check.isPending}><form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-neutral-600">Checks local approval and SVV. An unknown plate will be added to the vehicle list, without approval or statistics.</p>
    <Field label="Registration number *"><input autoFocus required disabled={check.isPending} className={inputClass} value={plate} onChange={e => setPlate(e.target.value)} /></Field>
    <label className="flex gap-2 text-sm"><input type="checkbox" disabled={check.isPending} checked={force} onChange={e => setForce(e.target.checked)} />Force new SVV lookup instead of using recent cached data</label>
    <ErrorNotice error={error} /><button className={primaryClass} disabled={check.isPending}>{check.isPending ? "Checking…" : "Run check"}</button>
  </form></VehicleDialog>;
}
