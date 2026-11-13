import type { SupplierRisk } from "../../types/dashboard";

// Keep risk status categorical and consistent with the Dashboard spec
const CONFIG: Record<SupplierRisk, { label: string; className: string }> = {
  high: { label: "Høy", className: "bg-red-100 text-red-700" },
  medium: { label: "Middels", className: "bg-amber-100 text-amber-800" },
  low: { label: "Lav", className: "bg-sky-100 text-sky-800" },
  compliant: { label: "Ingen funn", className: "bg-neutral-100 text-neutral-700" },
  unassessed: { label: "Ikke vurdert", className: "bg-neutral-100 text-neutral-500" },
};

export function RiskBadge({ level }: { level?: SupplierRisk | string }) {
  const config = CONFIG[level as SupplierRisk];

  if (!config) {
    return null; // Safe fallback for missing or unsupported risk values
  }

  const { label, className } = config;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-mono font-semibold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}