import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import * as api from "../../api/vehicles";
import { useFleetHistory, useRefreshVehicles } from "../../hooks/useVehicles";
import { timestamp } from "../../utils/vehicle";
import { ErrorNotice, buttonClass } from "./VehicleDialog";

export function ChangeHistory() {
  const [page, setPage] = useState(1);
  const history = useFleetHistory(page);
  const refresh = useRefreshVehicles();
  const undo = useMutation({ mutationFn: api.undoChange, onSuccess: refresh, retry: false });
  return <div className="space-y-3">
    {history.isLoading && <p role="status" className="text-sm">Laster endringer…</p>}
    <ErrorNotice error={history.error ?? undo.error} />
    <ul className="divide-y divide-neutral-100">{history.data?.map(change => <li key={change.id} className="flex items-center justify-between gap-4 py-3">
      <div><p className="text-sm">{change.description}</p><p className="mt-1 text-xs text-neutral-500">{timestamp(change.occurredAt)} · {change.actorName}{change.reversedBy ? " · Angret" : ""}</p></div>
      {!change.undoOf && !change.reversedBy && <button className={buttonClass} disabled={!change.canUndo || undo.isPending} title={change.canUndo ? undefined : "Senere endringer hindrer at denne handlingen kan angres."} onClick={() => undo.mutate(change.id)}>Angre</button>}
    </li>)}</ul>
    {!history.isLoading && history.data?.length === 0 && <p className="text-sm text-neutral-500">Ingen endringer ennå.</p>}
    <div className="flex justify-end gap-2"><button className={buttonClass} disabled={page === 1 || history.isFetching} onClick={() => setPage(page - 1)}>Forrige</button><button className={buttonClass} disabled={history.isFetching || (history.data?.length ?? 0) < 30} onClick={() => setPage(page + 1)}>Neste</button></div>
  </div>;
}
