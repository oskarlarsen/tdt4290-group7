import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import type { FleetAgreement, FleetSupplier, Vehicle } from "../../types/vehicle";
import { agreementDuration, validDate, validPlate } from "../../utils/vehicle";
import { VehicleDialog, Field, ErrorNotice, buttonClass, primaryClass, inputClass } from "./VehicleDialog";
import { RegistrationNumberInput } from "./VehicleInputs";
import { FieldTooltip } from "./FieldTooltip";
import { ConfirmAction } from "./ConfirmAction";

function FormFooter({ busy, label, onClose }: { busy: boolean; label: string; onClose: () => void }) {
  return <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
    <button type="button" className={buttonClass} disabled={busy} onClick={onClose}>Cancel</button>
    <button className={primaryClass} disabled={busy}>{busy ? "Saving…" : label}</button>
  </footer>;
}

export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: FleetSupplier; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [orgNumber, setOrgNumber] = useState(supplier?.orgNumber ?? "");
  const save = useMutation({ mutationFn: () => api.saveSupplier({ name, orgNumber }, supplier), onSuccess: onSaved, retry: false });
  return <VehicleDialog title={supplier ? "Edit supplier" : "Add supplier"} onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <Field label="Supplier name"><input autoFocus required maxLength={200} className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Organization number"><input required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} className={inputClass} value={orgNumber} onChange={e => setOrgNumber(e.target.value.replace(/\s/g, ""))} /></Field>
      <ErrorNotice error={save.error} /><FormFooter busy={save.isPending} label="Save supplier" onClose={onClose} />
    </form>
  </VehicleDialog>;
}

export function InviteSupplierForm({ supplier, onClose }: { supplier: FleetSupplier; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const invite = useMutation({
    mutationFn: () => api.inviteSupplier(supplier.id, email),
    onSuccess: ({ token }) => setInvitationUrl(`${window.location.origin}/accept-invitation#${token}`),
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

export function AgreementForm({ supplier, agreement, onClose, onSaved }: { supplier: FleetSupplier; agreement?: FleetAgreement; onClose: () => void; onSaved: () => void }) {
  const [startDate, setStart] = useState(agreement?.startDate ?? "");
  const [endDate, setEnd] = useState(agreement?.endDate ?? "");
  const [allowed, setAllowed] = useState(String(agreement?.allowedVehicles ?? ""));
  const [note, setNote] = useState(agreement?.note ?? "");
  const save = useMutation({ mutationFn: () => {
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error("Enter a valid agreement period.");
    if (!/^\d+$/.test(allowed) || Number(allowed) > 10000) throw new Error("Enter a vehicle allowance between 0 and 10000.");
    return api.saveAgreement({ supplierId: supplier.id, startDate, endDate, allowedVehicles: Number(allowed), note }, agreement);
  }, onSuccess: onSaved, retry: false });
  return <VehicleDialog title={`${agreement ? "Edit" : "Add"} agreement · ${supplier.name}`} onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date"><input autoFocus type="date" required className={inputClass} value={startDate} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="End date"><input type="date" required min={startDate} className={inputClass} value={endDate} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      {agreementDuration(startDate, endDate) && <p className="text-sm text-neutral-500">{agreementDuration(startDate, endDate)}</p>}
      <Field label="Maximum vehicles"><input type="number" required min={0} max={10000} step={1} className={inputClass} value={allowed} onChange={e => setAllowed(e.target.value)} /></Field>
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
        <button type="button" role="switch" aria-checked={planned} aria-label="Registration pending" disabled={save.isPending} onClick={() => setPlanned(!planned)} className={`relative h-6 w-11 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 ${planned ? "bg-primary-900" : "bg-neutral-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${planned ? "left-0.5 translate-x-5" : "left-0.5"}`} /></button>
        <span className="text-sm">Registration pending</span>
        <FieldTooltip label="Registration pending" text="Reserves one vehicle place until the registration number is available." />
      </div>}
      <fieldset disabled={save.isPending}><Field label={planned ? "Planned identifier" : "Registration number"}>
        {planned ? <input disabled className={`${inputClass} text-neutral-400`} value="Assigned automatically" /> : <RegistrationNumberInput autoFocus value={plate} onChange={setPlate} />}
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
