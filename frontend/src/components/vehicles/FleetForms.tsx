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
    <button type="button" className={buttonClass} disabled={busy} onClick={onClose}>Avbryt</button>
    <button className={primaryClass} disabled={busy}>{busy ? "Lagrer…" : label}</button>
  </footer>;
}

export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: FleetSupplier; onClose: () => void; onSaved: (savedSupplier: FleetSupplier) => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [orgNumber, setOrgNumber] = useState(supplier?.orgNumber ?? "");
  const save = useMutation({ mutationFn: () => api.saveSupplier({ name, orgNumber }, supplier), onSuccess: onSaved, retry: false });
  return <VehicleDialog title={supplier ? "Rediger leverandør" : "Legg til leverandør"} onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onChange={() => { if (save.isError) save.reset(); }} onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <Field label="Leverandørnavn"><input autoFocus required maxLength={200} className={inputClass} value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Organisasjonsnummer"><input required inputMode="numeric" pattern="[0-9]{9}" title="Oppgi organisasjonsnummer med 9 sifre" maxLength={9} className={inputClass} value={orgNumber} onChange={e => setOrgNumber(e.target.value.replace(/\s/g, ""))} /></Field>
      <ErrorNotice error={save.error} /><FormFooter busy={save.isPending} label="Lagre leverandør" onClose={onClose} />
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
    <button type="button" className={dangerClass} disabled={remove.isPending} onClick={() => { remove.reset(); setConfirming(true); }}>Fjern</button>
    {confirming && <ConfirmAction
      title={`Fjerne leverandøren ${supplier.name}?`}
      label="Fjern leverandør"
      busy={remove.isPending}
      error={remove.error}
      onCancel={() => { setConfirming(false); remove.reset(); }}
      onConfirm={() => remove.mutate()}
    >
      <p>Dette fjerner organisasjonen og deaktiverer {agreementCount} aktive {agreementCount === 1 ? "avtale" : "avtaler"} og {vehicleCount} kjøretøy på listen.</p>
      <p className="mt-2">Historiske opplysninger beholdes. Du kan angre dette fra endringshistorikken.</p>
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
      setCopyMessage("Invitasjonslenken er kopiert. Send den til leverandøren; den utløper om 48 timer.");
    } catch {
      setCopyMessage("Kopier invitasjonslenken under og send den til leverandøren. Den utløper om 48 timer.");
    }
  }
  return <VehicleDialog title={`Inviter konto · ${supplier.name}`} onClose={onClose} busy={invite.isPending}>
    {invitationUrl ? (
      <div className="space-y-4">
        <p className="text-sm text-neutral-700">Invitasjon opprettet for <strong>{email}</strong>. Del denne engangslenken med leverandøren:</p>
        <input readOnly aria-label="Invitasjonslenke for leverandør" className={inputClass} value={invitationUrl} onFocus={event => event.currentTarget.select()} />
        <p role="status" className="text-sm text-neutral-600">{copyMessage || "Lenken utløper om 48 timer og kan bare brukes én gang."}</p>
        <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button type="button" className={buttonClass} onClick={onClose}>Lukk</button>
          <button type="button" className={primaryClass} onClick={() => void copyInvitation()}>Kopier invitasjonslenke</button>
        </footer>
      </div>
    ) : (
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); invite.mutate(); }}>
        <p className="text-sm text-neutral-600">Opprett en leverandørkonto knyttet til denne organisasjonen. Den genererte lenken må deles manuelt med kontaktpersonen.</p>
        <Field label="E-post til kontaktperson"><input autoFocus required type="email" maxLength={254} className={inputClass} value={email} onChange={event => setEmail(event.target.value)} /></Field>
        <ErrorNotice error={invite.error} />
        <FormFooter busy={invite.isPending} label="Opprett invitasjon" onClose={onClose} />
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
    if (!saksnr.trim() || saksnr.trim().length > 50) throw new Error("Oppgi saksnummer (saksnr), maks 50 tegn.");
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error("Oppgi en gyldig avtaleperiode.");
    if (!/^\d+$/.test(allowed) || Number(allowed) > 10000) throw new Error("Oppgi et tillatt antall kjøretøy mellom 0 og 10000.");
    if (Number(allowed) < vehicleCount) throw new Error(`Avtalen har allerede ${vehicleCount} kjøretøy. Tillat minst ${vehicleCount}, eller fjern kjøretøy først.`);
    if (requiresVehicles && Number(allowed) === 0) throw new Error("Tillat minst ett kjøretøy, eller fjern avmerkingen for Kjøretøy under påkrevd informasjon.");
    if (!requiresVehicles && !requiresEnergy && !requiresProducts) throw new Error("Velg minst én type leverandørinformasjon som skal samles inn.");
    return api.saveAgreement({ supplierId: supplier.id, saksnr: saksnr.trim(), startDate, endDate, allowedVehicles: Number(allowed), note, requiresVehicles, requiresEnergy, requiresProducts }, agreement);
  }, onSuccess: onSaved, retry: false });
  return <VehicleDialog title={`${agreement ? "Rediger" : "Legg til"} avtale · ${supplier.name}`} onClose={onClose} busy={save.isPending}>
    <form className="space-y-4" onChange={() => { if (save.isError) save.reset(); }} onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <Field label="Saksnr (saksnummer)">
        <input autoFocus required maxLength={50} className={inputClass} value={saksnr} onChange={e => setSaksnr(e.target.value)} placeholder="2024/1234" />
        <span className="mt-1 block text-xs text-neutral-500">Saksnummeret fra arkivsystemet ditt, for eksempel 2024/1234.</span>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Startdato"><input type="date" required aria-label="Startdato" className={inputClass} value={startDate} onChange={e => setStart(e.target.value)} /></Field>
        <Field label="Sluttdato"><input type="date" required min={startDate} aria-label="Sluttdato" className={inputClass} value={endDate} onChange={e => setEnd(e.target.value)} /></Field>
      </div>
      {agreementDuration(startDate, endDate) && <p className="text-sm text-neutral-500">{agreementDuration(startDate, endDate)}</p>}
      <Field label="Maks. antall kjøretøy"><input type="number" required={requiresVehicles} min={vehicleCount} max={10000} step={1} aria-label="Maks. antall kjøretøy" className={inputClass} value={allowed} onChange={e => setAllowed(e.target.value)} /></Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-700">Informasjon som kreves fra leverandør</legend>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={requiresVehicles} onChange={event => setRequiresVehicles(event.target.checked)} />
          Kjøretøy
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={requiresEnergy} onChange={event => setRequiresEnergy(event.target.checked)} />
          Energi
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={requiresProducts} onChange={event => setRequiresProducts(event.target.checked)} />
          Produkter
        </label>
      </fieldset>
      <Field label="Notat (valgfritt)"><textarea maxLength={4000} rows={3} className={inputClass} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <ErrorNotice error={save.error} /><FormFooter busy={save.isPending} label="Lagre avtale" onClose={onClose} />
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
  const title = replacing?.planned ? "Registrer kjøretøy" : replacing ? `Erstatt ${replacing.registrationNumber}` : "Legg til kjøretøy";
  function submit(event: FormEvent) {
    event.preventDefault(); if (save.isPending) return;
    setValidationError(undefined); save.reset();
    try { if (!planned) validPlate(plate); } catch (error) { setValidationError(error); return; }
    if (replacing && !replacing.planned) setConfirming(true); else save.mutate();
  }
  return <><VehicleDialog title={title} onClose={onClose} busy={save.isPending}>
    <form className="space-y-5" onSubmit={submit}>
      {!replacing?.planned && <div className="relative flex items-center gap-3 pr-8">
        <button type="button" role="switch" aria-checked={planned} aria-label="Registrering venter" disabled={save.isPending} onClick={() => { setPlanned(!planned); edited(); }} className={`relative h-6 w-11 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-700 focus-visible:ring-offset-2 ${planned ? "bg-primary-900" : "bg-neutral-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${planned ? "left-0.5 translate-x-5" : "left-0.5"}`} /></button>
        <span className="text-sm">Registrering venter</span>
        <FieldTooltip label="Registrering venter" text="Reserverer én kjøretøyplass til registreringsnummeret er tilgjengelig." />
      </div>}
      <fieldset disabled={save.isPending}><Field label={planned ? "Planlagt identifikator" : "Registreringsnummer"}>
        {planned ? <input disabled className={`${inputClass} text-neutral-500`} value="Tildeles automatisk" /> : <RegistrationNumberInput autoFocus value={plate} onChange={value => { setPlate(value); edited(); }} />}
      </Field></fieldset>
      {save.isPending && !planned && <p role="status" className="text-sm text-neutral-500">Sjekker registreringen hos Statens vegvesen…</p>}
      <ErrorNotice error={validationError ?? save.error} /><FormFooter busy={save.isPending} label={save.isError ? "Prøv igjen" : replacing?.planned ? "Registrer kjøretøy" : replacing ? "Erstatt kjøretøy" : "Legg til kjøretøy"} onClose={onClose} />
    </form>
  </VehicleDialog>
    {confirming && replacing && <ConfirmAction title={`Erstatte ${replacing.registrationNumber} med ${planned ? "et kjøretøy med registrering som venter" : validPlate(plate)}?`}
      label="Erstatt kjøretøy" busy={save.isPending} error={save.error} onCancel={() => setConfirming(false)} onConfirm={() => save.mutate()}>
      <p>Erstatningen trer i kraft umiddelbart. Rapporter og historikk for det eksisterende kjøretøyet beholdes.</p>
      <p className="mt-2">Du kan angre dette fra endringshistorikken.</p>
    </ConfirmAction>}
  </>;
}
