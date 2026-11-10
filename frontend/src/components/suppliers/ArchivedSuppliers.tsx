import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { useArchive, useRefreshVehicles } from "../../hooks/useVehicles";
import type { ArchivedSupplier, FleetSupplier } from "../../types/vehicle";
import { ErrorNotice, buttonClass } from "../vehicles/VehicleDialog";

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "earlier");

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
            <span className="font-mono">{entry.supplier.orgNumber}</span> · archived {date(entry.archivedAt)} · {entry.agreements.length} agreement{entry.agreements.length === 1 ? "" : "s"} · {entry.vehicles.length} vehicle{entry.vehicles.length === 1 ? "" : "s"}
          </p>
        </div>
        <button type="button" className={buttonClass} disabled={reactivate.isPending} onClick={() => reactivate.mutate()}>{reactivate.isPending ? "Reactivating…" : "Reactivate"}</button>
      </div>
      {entry.agreements.length > 0 && (
        <ul className="space-y-1 text-xs text-neutral-600">
          {entry.agreements.map((agreement) => (
            <li key={agreement.id}>
              {agreement.startDate} to {agreement.endDate} · {agreement.saksnr ?? "no saksnr"} · up to {agreement.allowedVehicles} vehicles · {entry.vehicles.filter((vehicle) => vehicle.agreementId === agreement.id).length} registered
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
      <summary className="cursor-pointer text-lg font-semibold text-neutral-900">Archived suppliers ({entries.length})</summary>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        Earlier suppliers with their agreements and vehicles. Reactivating one keeps its old agreements archived; create a new agreement and invite a contact afterwards.
      </p>
      <ul className="mt-3 space-y-3">
        {entries.map((entry) => <Row key={entry.supplier.id} entry={entry} onReactivated={onReactivated} />)}
      </ul>
    </details>
  );
}
