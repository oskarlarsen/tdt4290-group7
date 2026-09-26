import type { RecentAlert } from "../../types/dashboard";

const SEVERITY_CLASSES: Record<RecentAlert["severity"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
};

export function AlertCard({
  alert,
  onDismiss,
  onInvestigate,
}: {
  alert: RecentAlert;
  onDismiss?: (id: string) => void;
  onInvestigate?: (id: string) => void;
}) {
  return (
    <div className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wide ${SEVERITY_CLASSES[alert.severity]}`}
        >
          {alert.severity}
        </span>
        <span className="font-mono text-xs text-neutral-400">{alert.timeAgo}</span>
      </div>
      <div className="mt-1.5 text-sm font-medium text-neutral-900">{alert.title}</div>
      <p className="mt-0.5 text-sm text-neutral-500">{alert.description}</p>
      <div className="mt-2 flex gap-2">
        <button
          // TODO: Replace the local callback with the alerts API when available
          onClick={() => onDismiss?.(alert.id)}
          className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
        >
          Dismiss
        </button>
        {alert.supplierId && (
          <button onClick={() => onInvestigate?.(alert.id)} className="rounded-lg bg-primary-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700">
            Investigate
          </button>
        )}
      </div>
    </div>
  );
}