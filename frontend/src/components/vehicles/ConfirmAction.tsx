import type { ReactNode } from "react";
import { VehicleDialog, ErrorNotice, buttonClass, dangerClass } from "./VehicleDialog";

export function ConfirmAction({ title, children, label, busy = false, error, onCancel, onConfirm }: {
  title: string; children: ReactNode; label: string; busy?: boolean; error?: unknown;
  onCancel: () => void; onConfirm: () => void;
}) {
  return <VehicleDialog title={title} onClose={onCancel} busy={busy}>
    <div className="space-y-4">
      <div className="text-sm text-neutral-700">{children}</div>
      <ErrorNotice error={error} />
      <footer className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <button autoFocus type="button" className={buttonClass} disabled={busy} onClick={onCancel}>Avbryt</button>
        <button type="button" className={dangerClass} disabled={busy} onClick={onConfirm}>{busy ? "Jobber…" : label}</button>
      </footer>
    </div>
  </VehicleDialog>;
}
