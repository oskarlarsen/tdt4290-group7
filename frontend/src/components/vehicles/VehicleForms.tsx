import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { ApiError } from "../../api/client";
import type { TripRow } from "../../types/vehicle";
import { DECIMAL_FIELDS, statisticsBody, validPlate, estimatedCo2Preview, statisticsSaveMessage } from "../../utils/vehicle";
import { VehicleDialog, Field, ErrorNotice, inputClass, buttonClass, primaryClass, checkboxClass } from "./VehicleDialog";
import { CatalogSelect, RegistrationNumberInput } from "./VehicleInputs";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, isTrailer, selectedCode, usesLitres, emissionsNotApplicable, INAPPLICABLE_EMISSION_FIELDS, statisticNotApplicable } from "../../utils/vehicleCatalog";

import { ConfirmAction } from "./ConfirmAction";

const statisticHelp: Record<string, string> = {
  co2GramsPerKm: "Oppgi verdien leverandøren har rapportert. Målinger fra Statens vegvesen hentes separat for sammenligning.",
  averageFuelConsumptionLitresPer100Km: "Liter brukt per 100 kilometer",
};
const emissionsHelp = "Ikke relevant etter rapporteringsreglene for elektriske eller hydrogendrevne kjøretøy.";

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
  const [discarding, setDiscarding] = useState(false);
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
      next.averageFuelConsumptionLitresPer100Km = ""; next.fuelConsumedLitres = "";
    }
    if (emissionsNotApplicable(next.fuelTechnology ?? "")) {
      next.co2Registered = "false";
      for (const field of INAPPLICABLE_EMISSION_FIELDS) next[field] = "";
    } else if (emissionsLocked) {
      next.co2Registered = "";
      for (const field of INAPPLICABLE_EMISSION_FIELDS) next[field] = "";
    }
    setValues(next); setDirty(true); setError(undefined); setOverlapAccepted(false);
    if (key === "registrationNumber") setRows([]);
  }
  function close() { if (!busy) { if (dirty) setDiscarding(true); else onClose(); } }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(undefined); setPreparing(true);
    try {
      const body = statisticsBody(values);
      const vehicle = await existingVehicle(validPlate(values.registrationNumber));
      const currentRows = vehicle?.tripRows ?? [];
      setRows(currentRows);
      const hasOverlap = currentRows.some(row => row.data.periodStart <= values.periodEnd && row.data.periodEnd >= values.periodStart);
      if (hasOverlap && !overlapAccepted) throw new Error("Bekreft at du vil legge til en overlappende rapporteringsperiode.");
      const result = await save.mutateAsync(body);
      onSaved(validPlate(values.registrationNumber), statisticsSaveMessage(result, validPlate(values.registrationNumber)));
    } catch (cause) { setError(cause); } finally { setPreparing(false); }
  }
  function decimalField(key: string, label: string) {
    const disabled = statisticNotApplicable(key, values.fuelTechnology ?? "");
    return <Field key={key} label={label} tooltip={disabled ? emissionsHelp : statisticHelp[key]}><input required={!disabled} disabled={disabled} inputMode="decimal" className={inputClass} value={disabled ? "Ikke relevant" : values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>;
  }
  return <><VehicleDialog title="Legg til rapporterte data" onClose={close} busy={busy}>
    <form onSubmit={submit} onInvalidCapture={event => { const disclosure = (event.target as HTMLElement).closest("details"); if (disclosure) disclosure.open = true; }} className="space-y-5">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="Registreringsnummer"><RegistrationNumberInput autoFocus readOnly={!!plate} value={values.registrationNumber} onChange={value => change("registrationNumber", value)} /></Field>
        <Field label="Drivstoff"><CatalogSelect catalog={FUEL_TECHNOLOGIES} value={values.fuelTechnology ?? ""} disabled={isTrailer(values.vehicleCategory ?? "")} notApplicable={isTrailer(values.vehicleCategory ?? "")} onChange={value => change("fuelTechnology", value)} /></Field>
        <Field label="Start på rapporteringsperiode"><input type="date" required className={inputClass} value={values.periodStart} onChange={e => change("periodStart", e.target.value)} /></Field>
        <Field label="Slutt på rapporteringsperiode"><input type="date" required min={values.periodStart || undefined} className={inputClass} value={values.periodEnd} onChange={e => change("periodEnd", e.target.value)} /></Field>
        {DECIMAL_FIELDS.filter(([key]) => ["totalTripKm", "co2GramsPerKm"].includes(key)).map(([key, label]) => decimalField(key, label))}
        <Field label="Estimert CO₂ (kg)" tooltip="Beregnes som distanse × rapportert CO₂-utslipp ÷ 1000."><input readOnly className={inputClass} value={emissionsLocked ? "Ikke relevant" : estimatedCo2Preview(values.totalTripKm ?? "", values.co2GramsPerKm ?? "")} /></Field>
      </fieldset>
      <details className="rounded-xl border border-neutral-200 p-4"><summary className="cursor-pointer text-sm font-medium">Flere detaljer</summary>
        <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Rapportert kjøretøytype"><CatalogSelect catalog={VEHICLE_CATEGORIES} value={values.vehicleCategory ?? ""} onChange={value => change("vehicleCategory", value)} /></Field>
          <Field label="Rapportert karosseritype"><CatalogSelect catalog={BODY_TYPES} value={values.bodyType ?? ""} onChange={value => change("bodyType", value)} /></Field>
          {[["make", "Merke"], ["model", "Modell"]].map(([key, label]) => <Field key={key} label={label}><input required className={inputClass} value={values[key] ?? ""} onChange={e => change(key, e.target.value)} /></Field>)}
          <Field label="Rapportert som CO₂-utslippende"><select required disabled={emissionsLocked} className={inputClass} value={values.co2Registered} onChange={e => change("co2Registered", e.target.value)}><option value="" disabled>Velg</option><option value="true">Ja</option><option value="false">Nei</option></select></Field>
          {DECIMAL_FIELDS.filter(([key]) => !["totalTripKm", "co2GramsPerKm"].includes(key)).map(([key, label]) => decimalField(key, label))}
          <div className="sm:col-span-2"><Field label="Kommentar (valgfritt)"><textarea className={inputClass} value={values.comment ?? ""} onChange={e => change("comment", e.target.value)} /></Field></div>
        </fieldset>
      </details>
      {overlapping && <label className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm"><input type="checkbox" className={checkboxClass} disabled={busy} checked={overlapAccepted} onChange={e => setOverlapAccepted(e.target.checked)} />Legg til en ny rad for denne overlappende perioden.</label>}
      <ErrorNotice error={error} />
      {!!error && <p className="text-xs text-neutral-500">Hvis lagringen ble avbrutt, sjekk eksisterende statistikk før du prøver igjen.</p>}
      <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4"><button type="button" className={buttonClass} disabled={busy} onClick={close}>Avbryt</button><button className={primaryClass} disabled={busy || (overlapping && !overlapAccepted)}>{busy ? "Lagrer og sjekker..." : "Lagre og sjekk"}</button></footer>
    </form>
  </VehicleDialog>
    {discarding && <ConfirmAction title="Forkaste rapporterte data?" label="Forkast data" onCancel={() => setDiscarding(false)} onConfirm={onClose}>
      <p>Dataene i dette skjemaet er ikke lagret.</p>
    </ConfirmAction>}
  </>;
}
