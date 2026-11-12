import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import type { FleetAgreement, FleetSupplier, Vehicle } from "../../types/vehicle";
import { agreementDuration, validDate, validPlate } from "../../utils/vehicle";
import { VehicleDialog, Field, ErrorNotice, buttonClass, dangerClass, primaryClass, inputClass } from "./VehicleDialog";
import { RegistrationNumberInput } from "./VehicleInputs";
import { FieldTooltip } from "./FieldTooltip";
import { ConfirmAction } from "./ConfirmAction";

function FormFooter({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) {
  return <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
    <button type="button" className={buttonClass} disabled={busy} onClick={onClose}>Cancel</button>
    <button className={primaryClass} disabled={busy}>{busy ? "Saving…" : label}</button>
  </footer>;
}

export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: FleetSupplier; onClose: () => void; onSaved: (savedSupplier: FleetSupplier) => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [orgNumber, setOrgNumber] = useState(supplier?.orgNumber ?? "");
  const save = useMutation({ mutationFn: () => api.saveSupplier({ name, orgNumber }, supplier), onSuccess: onSaved, retry: false });
  return <VehicleDialog title={supplier ? "Edit supplier" : "Add supplier"} onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onChange={() => { if (save.isError) save.reset(); }} onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <Field label="Supplier name"><input autoFocus required maxLength={200} className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Organization number"><input required inputMode="numeric" pattern="[0-9]{9}" title="Enter the 9-digit organization number" maxLength={9} className={inputClass} value={orgNumber} onChange={e => setOrgNumber(e.target.value.replace(/\s/g, ""))} /></Field>
      <ErrorNotice error={save.error} /><FormFooter busy={save.isPending} label="Save supplier" onClose={onClose} />
    </form>
  </VehicleDialog>;
}

export function RemoveSupplierAction({ supplier, agreementCount, vehicleCount, onRemoved }: {
  supplier: FleetSupplier; agreementCount: number; vehicleCount: number; onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.removeSupplier(supplier),
    onSuccess: () => { setConfirming(false); onRemoved(); },
    retry: false,
  });
  return <>
    <button type="button" className={dangerClass} disabled={remove.isPending} onClick={() => { remove.reset(); setConfirming(true); }}>Remove</button>
    {confirming && <ConfirmAction
      title={`Remove supplier ${supplier.name}?`}
      label="Remove supplier"
      busy={remove.isPending}
      error={remove.error}
      onCancel={() => { setConfirming(false); remove.reset(); }}
      onConfirm={() => remove.mutate()}
    >
      <p>This removes the organization and deactivates its {agreementCount} active agreement{agreementCount === 1 ? "" : "s"} and {vehicleCount} listed vehicle{vehicleCount === 1 ? "" : "s"}.</p>
      <p className="mt-2">Historical records are kept. You can undo this from Change history.</p>
    </ConfirmAction>}
  </>;
}

export function InviteSupplierForm({ supplier, onClose, onInvited }: { supplier: FleetSupplier; onClose: () => void; onInvited?: () => void }) {
  const [email, setEmail] = useState("");
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const invite = useMutation({
    mutationFn: () => api.inviteSupplier(supplier.id, email),
    onSuccess: ({ token }) => { setInvitationUrl(`${window.location.origin}/accept-invitation#${token}`); onInvited?.(); },
    retry: false,
  });
  async function copyInvitation() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopyMessage("Invitation link copied. Send it to the supplier; it expires in 48 hours.");
    } catch {
      setCopyMessage("Copy the invitation link below and send it to the supplier. It expires in 48 hours.");
    }
  }
  return <VehicleDialog title={`Invite account · ${supplier.name}`} onClose={onClose} busy={invite.isPending}>
    {invitationUrl ? (
      <div className="space-y-4">
        <p className="text-sm text-neutral-700">Invitation created for <strong>{email}</strong>. Share this one-time link with the supplier:</p>
        <input readOnly aria-label="Supplier invitation link" className={inputClass} value={invitationUrl} onFocus={event => event.currentTarget.select()} />
        <p role="status" className="text-sm text-neutral-600">{copyMessage || "The link expires in 48 hours and can only be used once."}</p>
        <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button type="button" className={buttonClass} onClick={onClose}>Close</button>
          <button type="button" className={primaryClass} onClick={() => void copyInvitation()}>Copy invitation link</button>
        </footer>
      </div>
    ) : (
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); invite.mutate(); }}>
        <p className="text-sm text-neutral-600">Create a supplier account linked to this organization. The generated link must be shared with the contact manually.</p>
        <Field label="Contact email"><input autoFocus required type="email" maxLength={254} className={inputClass} value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <ErrorNotice error={invite.error} />
        <FormFooter busy={invite.isPending} label="Create invitation" onClose={onClose} />
      </form>
    )}
  </VehicleDialog>;
}

export function AgreementForm({ supplier, agreement, vehicleCount = 0, onClose, onSaved }: { supplier: FleetSupplier; agreement?: FleetAgreement; vehicleCount?: number; onClose: () => void; onSaved: () => void }) {
  const [saksnr, setSaksnr] = useState(agreement?.saksnr ?? "");
  const [startDate, setStart] = useState(agreement?.startDate ?? "");
  const [endDate, setEnd] = useState(agreement?.endDate ?? "");
  const [allowed, setAllowed] = useState(String(agreement?.allowedVehicles ?? ""));
  const [note, setNote] = useState(agreement?.note ?? "");
  const [requiresVehicles, setRequiresVehicles] = useState(agreement?.requiresVehicles ?? true);
  const [requiresEnergy, setRequiresEnergy] = useState(agreement?.requiresEnergy ?? false);
  const [requiresProducts, setRequiresProducts] = useState(agreement?.requiresProducts ?? false);
  const save = useMutation({ mutationFn: () => {
    if (!saksnr.trim() || saksnr.trim().length > 50) throw new Error("Enter the saksnr (case number), up to 50 characters.");
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error("Enter a valid agreement period.");
    if (!/^\d+$/.test(allowed) || Number(allowed) > 10000) throw new Error("Enter a vehicle allowance between 0 and 10000.");
    if (Number(allowed) < vehicleCount) throw new Error(`The agreement already has ${vehicleCount} vehicles. Allow at least ${vehicleCount}, or remove vehicles first.`);
    if (requiresVehicles && Number(allowed) === 0) throw new Error("Allow at least one vehicle, or untick Vehicles under required information.");
    if (!requiresVehicles && !requiresEnergy && !requiresProducts) throw new Error("Select at least one type of supplier information to collect.");
    return api.saveAgreement({ supplierId: supplier.id, saksnr: saksnr.trim(), startDate, endDate, allowedVehicles: Number(allowed), note, requiresVehicles, requiresEnergy, requiresProducts }, agreement);
  }, onSuccess: onSaved, retry: false });
  return <VehicleDialog title={`${agreement ? "Edit" : "Add"} agreement · ${supplier.name}`} onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onChange={() => { if (save.isError) save.reset(); }} onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <Field label="Saksnr (case number)">
        <input autoFocus required maxLength={50} className={inputClass} value={saksnr} onChange={e => setSaksnr(e.target.value)} placeholder="2024/1234" />
        <span className="mt-1 block text-xs text-neutral-500">The case number from your archive system, for example 2024/1234.</span>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date"><input type="date" required aria-label="Start date" className={inputClass} value={startDate} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="End date"><input type="date" required min={startDate} aria-label="End date" className={inputClass} value={endDate} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      {agreementDuration(startDate, endDate) && <p className="text-sm text-neutral-500">{agreementDuration(startDate, endDate)}</p>}
      <Field label="Maximum vehicles"><input type="number" required min={vehicleCount} max={10000} step={1} aria-label="Maximum vehicles" className={inputClass} value={allowed} onChange={e => setAllowed(e.target.value)} /></Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-700">Information required from supplier</legend>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={requiresVehicles} onChange={event => setRequiresVehicles(event.target.checked)} />
          Vehicles
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={requiresEnergy} onChange={event => setRequiresEnergy(event.target.checked)} />
          Energy
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={requiresProducts} onChange={event => setRequiresProducts(event.target.checked)} />
          Products
        </label>
      </fieldset>
      <Field label="Note (optional)"><textarea maxLength={4000} rows={3} className={inputClass} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <ErrorNotice error={save.error} /><FormFooter busy={save.isPending} label="Save agreement" onClose={onClose} />
    </form>
  </VehicleDialog>;
}

export function VehicleEntryForm({ agreementId, replacing, onClose, onSaved }: { agreementId: string; replacing?: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [planned, setPlanned] = useState(false);
  const [plate, setPlate] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [validationError, setValidationError] = useState<unknown>();
  const save = useMutation({ mutationFn: () => {
    const input = planned ? { planned: true } : { planned: false, registrationNumber: validPlate(plate) };
    return replacing ? api.replaceVehicle(replacing, input) : api.addVehicle(agreementId, input);
  }, onSuccess: () => { setConfirming(false); onSaved(); }, retry: false });
  function edited() { setValidationError(undefined); if (save.isError) save.reset(); }
  const title = replacing?.planned ? "Register vehicle" : replacing ? `Replace ${replacing.registrationNumber}` : "Add vehicle";
  function submit(event: FormEvent) {
    event.preventDefault(); if (save.isPending) return;
    setValidationError(undefined); save.reset();
    try { if (!planned) validPlate(plate); } catch (error) { setValidationError(error); return; }
    if (replacing && !replacing.planned) setConfirming(true); else save.mutate();
  }
  return <><VehicleDialog title={title} onClose={onClose} busy={save.isPending}>
    <form className="space-y-5" onSubmit={submit}>
      {!replacing?.planned && <div className="relative flex items-center gap-3 pr-8">
        <button type="button" role="switch" aria-checked={planned} aria-label="Registration pending" disabled={save.isPending} onClick={() => { setPlanned(!planned); edited(); }} className={`relative h-6 w-11 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 ${planned ? "bg-primary-900" : "bg-neutral-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${planned ? "left-0.5 translate-x-5" : "left-0.5"}`} /></button>
        <span className="text-sm">Registration pending</span>
        <FieldTooltip label="Registration pending" text="Reserves one vehicle place until the registration number is available." />
      </div>}
      <fieldset disabled={save.isPending}><Field label={planned ? "Planned identifier" : "Registration number"}>
        {planned ? <input disabled className={`${inputClass} text-neutral-500`} value="Assigned automatically" /> : <RegistrationNumberInput autoFocus value={plate} onChange={value => { setPlate(value); edited(); }} />}
      </Field></fieldset>
      {save.isPending && !planned && <p role="status" className="text-sm text-neutral-500">Checking registration with Statens vegvesen…</p>}
      <ErrorNotice error={validationError ?? save.error} /><FormFooter busy={save.isPending} label={save.isError ? "Try again" : replacing?.planned ? "Register vehicle" : replacing ? "Replace vehicle" : "Add vehicle"} onClose={onClose} />
    </form>
  </VehicleDialog>
    {confirming && replacing && <ConfirmAction title={`Replace ${replacing.registrationNumber} with ${planned ? "a vehicle with registration pending" : validPlate(plate)}?`}
      label="Replace vehicle" busy={save.isPending} error={save.error} onCancel={() => setConfirming(false)} onConfirm={() => save.mutate()}>
      <p>The replacement takes effect immediately. The existing vehicle’s reports and history are kept.</p>
      <p className="mt-2">You can undo this from Change history.</p>
    </ConfirmAction>}
  </>;
}

/** Admin pastes or loads the supplier's approved-vehicle list; every plate is checked with Statens vegvesen as it is added. */
export function BulkVehicleForm({ agreementId, onClose, onSaved }: { agreementId: string; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  // shortcut: reads plain text/CSV only, so an Excel file must be saved as CSV first; add xlsx parsing if admins ask.
  const plates = [...new Set(text.toUpperCase().replace(/\s/g, "").match(/[A-Z]{2}[1-9][0-9]{3,4}/g) ?? [])];
  const save = useMutation({ mutationFn: () => api.addVehiclesBulk(agreementId, plates), onSuccess: result => { if (!result.failed.length) onSaved(); }, retry: false });
  const failed = save.data?.failed ?? [];
  return <VehicleDialog title="Add several vehicles" onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); if (plates.length && !save.isPending) save.mutate(); }}>
      <Field label="Registration numbers (paste, or load a .csv/.txt file)">
        <textarea rows={6} className={`${inputClass} font-mono`} value={text} disabled={save.isPending} onChange={e => { setText(e.target.value); save.reset(); }} />
      </Field>
      <input type="file" accept=".csv,.txt" disabled={save.isPending} className="block w-full text-sm text-neutral-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800 hover:file:bg-neutral-50" onChange={async e => { const file = e.target.files?.[0]; if (file) { setText(await file.text()); save.reset(); } }} />
      <p className="text-sm text-neutral-500">{plates.length} registration number{plates.length === 1 ? "" : "s"} found{plates.length > 200 ? " (max 200 at a time)" : ""}.</p>
      {save.isPending && <p role="status" className="text-sm text-neutral-500">Checking with Statens vegvesen…</p>}
      {save.data && <p role="status" className="text-sm">Added {save.data.added.length}.</p>}
      {failed.length > 0 && <ul className="space-y-1 text-sm text-red-700">{failed.map(f => <li key={f.registrationNumber}><span className="font-mono">{f.registrationNumber}</span>: {f.reason}</li>)}</ul>}
      <ErrorNotice error={save.error} />
      <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button type="button" className={buttonClass} disabled={save.isPending} onClick={failed.length ? onSaved : onClose}>{failed.length ? "Done" : "Cancel"}</button>
        {!save.data && <button className={primaryClass} disabled={save.isPending || !plates.length || plates.length > 200}>{save.isPending ? "Adding…" : "Add vehicles"}</button>}
      </footer>
    </form>
  </VehicleDialog>;
}
