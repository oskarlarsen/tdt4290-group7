import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { ApiError } from "../../api/client";
import type { StoredApproval, TripRow } from "../../types/vehicle";
import { DECIMAL_FIELDS, statisticsBody, validDate, validPlate, estimatedCo2Preview, statisticsSaveMessage } from "../../utils/vehicle";
import { VehicleDialog, Field, ErrorNotice, inputClass, buttonClass, primaryClass, checkboxClass } from "./VehicleDialog";
import { CatalogSelect, RegistrationNumberInput } from "./VehicleInputs";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, isTrailer, selectedCode, usesLitres, emissionsNotApplicable, INAPPLICABLE_EMISSION_FIELDS, statisticNotApplicable } from "../../utils/vehicleCatalog";

const statisticHelp: Record<string, string> = {
  co2GramsPerKm: "Enter the supplier’s reported value. Statens Vegvesen measurements are retrieved separately for comparison.",
  averageFuelConsumptionLitresPer100Km: "Liters used per 100 kilometers",
};
const emissionsHelp = "Not applicable under the reporting rules for electric or hydrogen vehicles.";
const litresHelp = "The selected fuel technology is not reported in liters.";
const categoryHelp = "Technical vehicle category, such as M1 passenger car. Body style is selected separately.";

type Props = { plate?: string; onClose: () => void; onSaved: (plate: string, message: string) => void };

async function existingVehicle(plate: string) {
  try { return await api.getVehicle(plate); } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) return null;
    throw cause;
  }
}

export function StatisticsForm({ plate, existingRows = [], onClose, onSaved }: Props & { existingRows?: TripRow[] }) {
  const [values, setValues] = useState<Record<string, string>>({ registrationNumber: plate ?? "", periodStart: "", periodEnd: "", co2Registered: "" });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>();
  const [overlapAccepted, setOverlapAccepted] = useState(false);
  const [rows, setRows] = useState(existingRows);
  const [preparing, setPreparing] = useState(false);
  const save = useMutation({ mutationFn: api.appendStatistics, retry: false });
  const busy = preparing || save.isPending;
  const overlapping = rows.some(row => values.periodStart && values.periodEnd && row.data.periodStart <= values.periodEnd && row.data.periodEnd >= values.periodStart);
  const emissionsLocked = emissionsNotApplicable(values.fuelTechnology ?? "");
  function change(key: string, value: string) {
    const next = { ...values, [key]: value };
    if (key === "vehicleCategory") {
      if (isTrailer(value)) next.fuelTechnology = "NOT_APPLICABLE";
      else if (next.fuelTechnology === "NOT_APPLICABLE") next.fuelTechnology = "";
    }
    if (!usesLitres(next.fuelTechnology ?? "")) {
      if ((values.averageFuelConsumptionLitresPer100Km || values.fuelConsumedLitres) &&
        !window.confirm("This selection makes litres not applicable. Clear the litres values you entered?")) return;
      next.averageFuelConsumptionLitresPer100Km = ""; next.fuelConsumedLitres = "";
    }
    if (emissionsNotApplicable(next.fuelTechnology ?? "")) {
      if (!emissionsLocked && (values.co2Registered === "true" || INAPPLICABLE_EMISSION_FIELDS.some(field => values[field])) &&
          !window.confirm("CO₂ and NOx values and registered distances are not applicable for electric or hydrogen vehicles. Clear the values you entered?")) return;
      next.co2Registered = "false";
      for (const field of INAPPLICABLE_EMISSION_FIELDS) next[field] = "";
    } else if (emissionsLocked) {
      next.co2Registered = "";
      for (const field of INAPPLICABLE_EMISSION_FIELDS) next[field] = "";
    }
    setValues(next); setDirty(true); setError(undefined); setOverlapAccepted(false);
    if (key === "registrationNumber") setRows([]);
  }
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
      const result = await save.mutateAsync(body);
      onSaved(validPlate(values.registrationNumber), statisticsSaveMessage(result, validPlate(values.registrationNumber)));
    } catch (cause) { setError(cause); } finally { setPreparing(false); }
  }
  return <VehicleDialog title="Add vehicle trip/period statistics" onClose={close} busy={busy}>
    <form onSubmit={submit} className="space-y-5">
      <p className="rounded-lg bg-neutral-50 p-3 text-sm leading-5 text-neutral-600">One row describes a trip or reporting period. All applicable fields are required unless marked optional. Saving adds a new row and runs a check; it does not approve the vehicle.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration number"><RegistrationNumberInput autoFocus readOnly={!!plate} value={values.registrationNumber} onChange={value => change("registrationNumber", value)} /></Field>
        <Field label="Source / reference (optional)"><input className={inputClass} value={values.sourceName ?? ""} onChange={e => change("sourceName", e.target.value)} /></Field>
        <Field label="Period start"><input type="date" required className={inputClass} value={values.periodStart} onChange={e => change("periodStart", e.target.value)} /></Field>
        <Field label="Period end"><input type="date" required min={values.periodStart || undefined} className={inputClass} value={values.periodEnd} onChange={e => change("periodEnd", e.target.value)} /></Field>
        <Field label="Reported vehicle category" tooltip={categoryHelp}><CatalogSelect catalog={VEHICLE_CATEGORIES} value={values.vehicleCategory ?? ""} onChange={value => change("vehicleCategory", value)} /></Field>
        <Field label="Reported fuel technology"><CatalogSelect catalog={FUEL_TECHNOLOGIES} value={values.fuelTechnology ?? ""} disabled={isTrailer(values.vehicleCategory ?? "")} notApplicable={isTrailer(values.vehicleCategory ?? "")} onChange={value => change("fuelTechnology", value)} /></Field>
        <Field label="Reported body type"><CatalogSelect catalog={BODY_TYPES} value={values.bodyType ?? ""} onChange={value => change("bodyType", value)} /></Field>
        {[["make", "Vehicle brand"], ["model", "Vehicle model"]].map(([key, label]) => <Field key={key} label={label}><input required className={inputClass} value={values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>)}
        <Field label="Job/trip count"><input required inputMode="numeric" className={inputClass} value={values.tripCount ?? ""} onChange={e => change("tripCount", e.target.value)} /></Field>
        <Field label="Registered as CO₂-emitting" tooltip={emissionsLocked ? "Set to No for electric or hydrogen vehicles under the reporting rules." : undefined}><select required disabled={emissionsLocked} className={inputClass} value={values.co2Registered} onChange={e => change("co2Registered", e.target.value)}><option value="" disabled>Select Yes or No</option><option value="true">Yes</option><option value="false">No</option></select></Field>
        {DECIMAL_FIELDS.slice(0, 2).map(([key, label]) => {
          const notApplicable = statisticNotApplicable(key, values.fuelTechnology ?? "");
          return <Field key={key} label={label} tooltip={notApplicable ? emissionsHelp : statisticHelp[key]}><input required={!notApplicable} disabled={notApplicable} inputMode="decimal" className={inputClass} value={notApplicable ? "Not applicable" : values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>;
        })}
        <Field label="Total CO₂ (kg, calculated)" tooltip={emissionsLocked ? emissionsHelp : "Calculated from total distance × supplier CO₂ g/km ÷ 1000. This is an estimate, not measured emissions."}><input readOnly aria-label="Total CO₂ (kg, calculated)" className={inputClass} value={emissionsLocked ? "Not applicable" : estimatedCo2Preview(values.totalTripKm ?? "", values.co2GramsPerKm ?? "")} placeholder="Enter distance and CO₂ rate" /></Field>
          {DECIMAL_FIELDS.slice(2).map(([key, label]) => {
            const disabled = statisticNotApplicable(key, values.fuelTechnology ?? "");
            const tooltip = disabled ? (["averageFuelConsumptionLitresPer100Km", "fuelConsumedLitres"].includes(key) ? litresHelp : emissionsHelp) : statisticHelp[key];
            return <Field key={key} label={label} tooltip={tooltip}><input required={!disabled} disabled={disabled} inputMode="decimal" className={inputClass} value={disabled ? "Not applicable" : values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>;
          })}
          <div className="sm:col-span-2"><Field label="Comment (optional)"><textarea className={inputClass} value={values.comment ?? ""} onChange={e => change("comment", e.target.value)} /></Field></div>
      </fieldset>
      <p className="text-xs text-neutral-500">Use a decimal point, e.g. 12.34. Registered distances follow the supplier’s reporting definitions; no contractual meaning is assumed here.</p>
      {overlapping && <label className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><input type="checkbox" className={checkboxClass} disabled={busy} checked={overlapAccepted} onChange={e => setOverlapAccepted(e.target.checked)} />This period overlaps existing statistics. I intend to append another row.</label>}
      <ErrorNotice error={error} />
      {!!error && <p className="text-xs text-neutral-600">If the connection failed after sending, close this form and inspect the vehicle’s statistics before resubmitting: the row may already have been saved.</p>}
      <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4"><button type="button" className={buttonClass} disabled={busy} onClick={close}>Cancel</button><button className={primaryClass} disabled={busy || (overlapping && !overlapAccepted)}>{busy ? "Saving and checking…" : "Save and check"}</button></footer>
    </form>
  </VehicleDialog>;
}

export function ApprovalForm({ plate, approval, onClose, onSaved }: Props & { approval?: StoredApproval | null }) {
  // Revoked approvals are history; a subsequent approval starts a new record.
  const existing = approval && !approval.revokedAt ? approval : null;
  const [values, setValues] = useState({ registrationNumber: plate ?? "", fuelTechnology: existing?.data.fuelTechnology ?? "", vehicleCategory: existing?.data.vehicleCategory ?? "", sourceName: existing?.sourceName ?? "", startDate: existing?.data.startDate ?? "", expiryDate: existing?.data.expiryDate ?? "" });
  const [indefinite, setIndefinite] = useState(!existing?.data.expiryDate);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>();
  const [preparing, setPreparing] = useState(false);
  const save = useMutation({ mutationFn: (body: Parameters<typeof api.saveApproval>) => api.saveApproval(...body), retry: false });
  const busy = preparing || save.isPending;
  function change(key: keyof typeof values, value: string) {
    const next = { ...values, [key]: value };
    if (key === "vehicleCategory") {
      if (isTrailer(value)) next.fuelTechnology = "NOT_APPLICABLE";
      else if (next.fuelTechnology === "NOT_APPLICABLE") next.fuelTechnology = "";
    }
    setValues(next); setDirty(true); setError(undefined);
  }
  function close() { if (!busy && (!dirty || window.confirm("Discard your approval changes?"))) onClose(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(undefined); setPreparing(true);
    try {
      const registrationNumber = validPlate(values.registrationNumber);
      const fuelTechnology = selectedCode(FUEL_TECHNOLOGIES, values.fuelTechnology, "fuel technology");
      const vehicleCategory = selectedCode(VEHICLE_CATEGORIES, values.vehicleCategory, "vehicle category");
      if (isTrailer(vehicleCategory) !== (fuelTechnology === "NOT_APPLICABLE")) throw new Error("Select Not applicable fuel exactly for trailer categories.");
      if (values.startDate && !validDate(values.startDate)) throw new Error("Enter a valid approval start date.");
      if (!indefinite && !validDate(values.expiryDate)) throw new Error("Enter an expiry date or select indefinite approval.");
      if (!indefinite && values.startDate && values.expiryDate < values.startDate) throw new Error("Expiry cannot be before the start date.");
      const current = await existingVehicle(registrationNumber);
      const currentApproval = current?.approval;
      if (currentApproval && !currentApproval.revokedAt && (!existing || currentApproval.id !== existing.id || currentApproval.updatedAt !== existing.updatedAt))
        throw new Error("This vehicle already has an approval, or its approval has changed. Close this form and open the vehicle to edit its current approval without overwriting unseen fields.");
      if (existing && (!currentApproval || currentApproval.revokedAt)) throw new Error("This approval was revoked while you were editing. Close and reopen the vehicle to create a new approval.");
      await save.mutateAsync([{
        registrationNumber, fuelTechnology, vehicleCategory,
        startDate: values.startDate || null, expiryDate: indefinite ? null : values.expiryDate,
      }, values.sourceName.trim() || null]);
      onSaved(registrationNumber, "Approval saved. Previous check results are unchanged; run a new check to record the updated approval.");
    } catch (cause) { setError(cause); } finally { setPreparing(false); }
  }
  return <VehicleDialog title={existing ? "Edit vehicle approval" : "Approve vehicle"} onClose={close} busy={busy}>
    <form onSubmit={submit} className="space-y-5">
      <p className="rounded-lg bg-neutral-50 p-3 text-sm leading-5 text-neutral-600">Approval is separate from statistics. {existing ? "Saving replaces the current approval fields; clearing a field removes its value." : "Reapproving a revoked vehicle creates a new approval record."}</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Registration number *"><RegistrationNumberInput autoFocus readOnly={!!plate} value={values.registrationNumber} onChange={value => change("registrationNumber", value)} /></Field>
        <Field label="Vehicle category *" tooltip={categoryHelp}><CatalogSelect catalog={VEHICLE_CATEGORIES} value={values.vehicleCategory} onChange={value => change("vehicleCategory", value)} /></Field>
        <Field label="Approved fuel technology *"><CatalogSelect catalog={FUEL_TECHNOLOGIES} value={values.fuelTechnology} disabled={isTrailer(values.vehicleCategory)} notApplicable={isTrailer(values.vehicleCategory)} onChange={value => change("fuelTechnology", value)} /></Field>
        <Field label="Start date (blank = immediate)"><input type="date" className={inputClass} value={values.startDate} onChange={e => change("startDate", e.target.value)} /></Field>
        <Field label="Source / reference"><input className={inputClass} value={values.sourceName} onChange={e => change("sourceName", e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field label="Approval duration" tooltip={indefinite ? "Approval remains valid until it is manually revoked." : undefined}><span className="flex items-start gap-2 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700"><input type="checkbox" className={checkboxClass} checked={indefinite} onChange={e => { setIndefinite(e.target.checked); setDirty(true); }} />Approved indefinitely</span></Field></div>
        {!indefinite && <Field label="Expiry date * (inclusive)"><input required type="date" min={values.startDate || undefined} className={inputClass} value={values.expiryDate} onChange={e => change("expiryDate", e.target.value)} /></Field>}
      </fieldset>
      <ErrorNotice error={error} />
      <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4"><button type="button" className={buttonClass} disabled={busy} onClick={close}>Cancel</button><button className={primaryClass} disabled={busy}>{busy ? "Saving…" : "Save approval"}</button></footer>
    </form>
  </VehicleDialog>;
}
