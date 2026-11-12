import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { useArchive, useRefreshVehicles } from "../../hooks/useVehicles";
import type { ArchivedSupplier, FleetSupplier } from "../../types/vehicle";
import { ErrorNotice, buttonClass } from "../vehicles/VehicleDialog";

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "tidligere");

function Row({ entry, onReactivated }: { entry: ArchivedSupplier; onReactivated: (supplier: FleetSupplier) => void }) {
  const refresh = useRefreshVehicles();
  const reactivate = useMutation({
    mutationFn: () => api.reactivateSupplier(entry.supplier),
    onSuccess: (supplier) => { void refresh(); onReactivated(supplier); },
    retry: false,
  });
  return (
    <li className="space-y-2 rounded-lg border border-neutral-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">{entry.supplier.name}</p>
          <p className="text-xs text-neutral-500">
            <span className="font-mono">{entry.supplier.orgNumber}</span> · arkivert {date(entry.archivedAt)} · {entry.agreements.length} {entry.agreements.length === 1 ? "avtale" : "avtaler"} · {entry.vehicles.length} kjøretøy
          </p>
        </div>
        <button type="button" className={buttonClass} disabled={reactivate.isPending} onClick={() => reactivate.mutate()}>{reactivate.isPending ? "Reaktiverer…" : "Reaktiver"}</button>
      </div>
      {entry.agreements.length > 0 && (
        <ul className="space-y-1 text-xs text-neutral-600">
          {entry.agreements.map((agreement) => (
            <li key={agreement.id}>
              {agreement.startDate} til {agreement.endDate} · {agreement.saksnr ?? "ingen saksnr"} · opptil {agreement.allowedVehicles} kjøretøy · {entry.vehicles.filter((vehicle) => vehicle.agreementId === agreement.id).length} registrert
            </li>
          ))}
        </ul>
      )}
      <ErrorNotice error={reactivate.error} />
    </li>
  );
}

/** Suppliers that were removed stay in the system: admins can look back at them, or bring one back when it returns. */
export function ArchivedSuppliers({ onReactivated }: { onReactivated: (supplier: FleetSupplier) => void }) {
  const archive = useArchive();
  if (archive.isError) return <ErrorNotice error={archive.error} />;
  const entries = archive.data?.suppliers ?? [];
  if (entries.length === 0) return null;
  return (
    <details className="rounded-xl border border-neutral-100 bg-white p-4">
      <summary className="cursor-pointer text-lg font-semibold text-neutral-900">Arkiverte leverandører ({entries.length})</summary>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        Tidligere leverandører med avtaler og kjøretøy. Reaktivering beholder de gamle avtalene arkivert; opprett en ny avtale og inviter en kontaktperson etterpå.
      </p>
      <ul className="mt-3 space-y-3">
        {entries.map((entry) => <Row key={entry.supplier.id} entry={entry} onReactivated={onReactivated} />)}
      </ul>
    </details>
  );
}
