import type { RiskCategory } from "../../types/dashboard";

// Keep risk status categorical and consistent with the Dashboard spec
const CONFIG: Record<RiskCategory, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-red-700" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-800" },
  compliant: { label: "Compliant", className: "bg-neutral-100 text-neutral-700" },
};

export function RiskBadge({ level }: { level: RiskCategory }) {
  const { label, className } = CONFIG[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono font-semibold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}