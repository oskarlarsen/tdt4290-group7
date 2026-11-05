import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import type { FleetAgreement, FleetSupplier, Vehicle } from "../../types/vehicle";
import { agreementDuration, vehicleDate } from "../../utils/vehicle";
import { useRefreshVehicles } from "../../hooks/useVehicles";
import { AgreementForm, VehicleEntryForm } from "./FleetForms";
import { ConfirmAction } from "./ConfirmAction";
import { ErrorNotice, buttonClass, dangerClass, primaryClass } from "./VehicleDialog";
import { CopyableValue } from "../ui/CopyableValue";

export function VehicleAllowance({ count, allowed }: { count: number; allowed: number }) {
  return <span className={`text-sm font-medium ${count > allowed ? "text-red-700" : "text-neutral-700"}`}>{count} of {allowed} vehicles</span>;
}

export function AgreementCard({ supplier, agreement, vehicles, onOpen }: { supplier: FleetSupplier; agreement: FleetAgreement; vehicles: Vehicle[]; onOpen: (plate: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState<Vehicle | "new" | null>(null);
  const [removing, setRemoving] = useState<Vehicle | "agreement" | null>(null);
  const refresh = useRefreshVehicles();
  const listed = vehicles.filter(vehicle => vehicle.listed);
  const removed = vehicles.filter(vehicle => !vehicle.listed);
  function removalSaved() { setRemoving(null); void refresh(); }
  const remove = useMutation({ mutationFn: api.removeVehicle, onSuccess: removalSaved, retry: false });
  const removeAgreement = useMutation({ mutationFn: () => api.removeAgreement(agreement), onSuccess: removalSaved, retry: false });
  function saved() { setEditing(false); setEntry(null); void refresh(); }
  function vehicleRow(vehicle: Vehicle) {
    return <li key={vehicle.registrationNumber} className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 py-3">
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-medium">{vehicle.registrationNumber}</span>{vehicle.planned && <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">Registration pending</span>}</div>
      <div className="flex flex-wrap gap-2">
        {!vehicle.planned && <button className={buttonClass} onClick={() => onOpen(vehicle.registrationNumber)}>View details</button>}
        {vehicle.listed && <><button className={buttonClass} onClick={() => setEntry(vehicle)}>{vehicle.planned ? "Register vehicle" : "Replace vehicle"}</button>
          <button className={buttonClass} disabled={remove.isPending} onClick={() => { remove.reset(); setRemoving(vehicle); }}>Remove</button></>}
      </div>
    </li>;
  }
  return <article className="rounded-xl border border-neutral-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1">
        <h3 className="font-medium text-neutral-900">{vehicleDate(agreement.startDate)} – {vehicleDate(agreement.endDate)}</h3>
        <p className="text-xs text-neutral-500">{agreementDuration(agreement.startDate, agreement.endDate)}</p>
        <CopyableValue label="Agreement ID (for supplier CSV)" value={agreement.id} />
      </div>
      <VehicleAllowance count={listed.length} allowed={agreement.allowedVehicles} />
    </div>
    <div className="my-4 flex flex-wrap gap-2">
      <button className={primaryClass} disabled={listed.length >= agreement.allowedVehicles} onClick={() => setEntry("new")}>Add vehicle</button>
      <button className={buttonClass} onClick={() => setEditing(true)}>Edit agreement</button>
    </div>
    <ErrorNotice error={remove.error ?? removeAgreement.error} />
    {listed.length ? <ul>{listed.map(vehicleRow)}</ul> : <p className="py-3 text-sm text-neutral-500">No vehicles added.</p>}
    <details className="mt-3 border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-xs font-medium text-neutral-500">Agreement details</summary>
      <div className="mt-3 space-y-3">{agreement.note && <p className="whitespace-pre-wrap text-sm text-neutral-700">{agreement.note}</p>}
        {removed.length > 0 && <details><summary className="cursor-pointer text-sm">Previous vehicles ({removed.length})</summary><ul>{removed.map(vehicleRow)}</ul></details>}
        <button className={dangerClass} disabled={removeAgreement.isPending} onClick={() => { removeAgreement.reset(); setRemoving("agreement"); }}>Remove agreement</button>
      </div>
    </details>
    {editing && <AgreementForm supplier={supplier} agreement={agreement} onClose={() => setEditing(false)} onSaved={saved} />}
    {entry && <VehicleEntryForm agreementId={agreement.id} replacing={entry === "new" ? undefined : entry} onClose={() => setEntry(null)} onSaved={saved} />}
    {removing && <ConfirmAction title={removing === "agreement" ? `Remove agreement for ${supplier.name}?` : `Remove ${removing.registrationNumber}?`}
      label={removing === "agreement" ? "Remove agreement" : "Remove vehicle"} busy={remove.isPending || removeAgreement.isPending}
      error={removing === "agreement" ? removeAgreement.error : remove.error} onCancel={() => setRemoving(null)}
      onConfirm={() => { if (removing === "agreement") removeAgreement.mutate(); else remove.mutate(removing); }}>
      {removing === "agreement" ? <p>This removes the agreement for {vehicleDate(agreement.startDate)} – {vehicleDate(agreement.endDate)} and its {listed.length} listed vehicles.</p>
        : <p>This removes {removing.registrationNumber} from this agreement’s current vehicle list.</p>}
      <p className="mt-2">History is kept. You can undo this from Change history.</p>
    </ConfirmAction>}
  </article>;
}
