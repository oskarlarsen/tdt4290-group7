import type { RecentAlert } from "../../types/dashboard";

const SEVERITY_CLASSES: Record<RecentAlert["severity"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-tertiary-100 text-tertiary-700",
};

export function AlertCard({
  alert,
  onResolve,
  onInvestigate,
  isUpdating,
}: {
  alert: RecentAlert;
  onResolve?: (id: string) => void;
  onInvestigate?: (id: string) => void;
  isUpdating?: boolean;
}) {
  return (
    <div className="border-t border-neutral-100 py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wide ${SEVERITY_CLASSES[alert.severity]}`}
        >
          {alert.severity}
        </span>
        <span className="font-mono text-xs text-neutral-500">{alert.timeAgo}</span>
      </div>
      <div className="mt-1.5 text-sm font-medium text-neutral-900">{alert.title}</div>
      <p className="mt-0.5 text-sm text-neutral-500">{alert.description}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={isUpdating ? "Updating alert" : "Mark alert resolved"}
          onClick={() => onResolve?.(alert.id)}
          disabled={isUpdating || !onResolve}
          className="inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-900/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUpdating ? "Updating…" : "Mark resolved"}
        </button>
        {alert.supplierId && (
          <button
            type="button"
            onClick={() => onInvestigate?.(alert.id)}
            className="inline-flex items-center justify-center rounded-lg bg-primary-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!onInvestigate}
          >
            View details
          </button>
        )}
      </div>
    </div>
  );
}