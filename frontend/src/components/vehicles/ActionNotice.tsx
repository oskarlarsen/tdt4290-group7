import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { FleetChange } from "../../types/vehicle";
import { undoChange } from "../../api/vehicles";
import { useRefreshVehicles } from "../../hooks/useVehicles";
import { ErrorNotice, buttonClass } from "./VehicleDialog";

/** Announce this session's completed actions; don't repeat historical changes on initial load. */
export function ActionNotice({ latest, ready }: { latest?: FleetChange; ready: boolean }) {
  const previous = useRef<string | undefined>(undefined);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const refresh = useRefreshVehicles();
  const undo = useMutation({ mutationFn: undoChange, onSuccess: refresh, retry: false });
  useEffect(() => {
    if (latest) {
      if (previous.current !== undefined && previous.current !== latest.id) setVisibleId(latest.id);
      previous.current = latest.id;
    } else if (ready) previous.current = "";
  }, [latest, ready]);
  if (!latest || visibleId !== latest.id) return null;
  return <div className="rounded-xl border border-neutral-200 bg-white p-3">
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{latest.description}</span>
      <div className="flex gap-2">{latest.canUndo && <button className={buttonClass} disabled={undo.isPending} onClick={() => undo.mutate(latest.id)}>Angre</button>}
        <button className={buttonClass} onClick={() => setVisibleId(null)}>Skjul</button></div>
    </div><ErrorNotice error={undo.error} />
  </div>;
}
