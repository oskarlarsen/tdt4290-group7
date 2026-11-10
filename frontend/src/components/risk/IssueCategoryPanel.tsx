import { Link } from "react-router-dom";
import { Truck, BadgeCheck, Zap } from "lucide-react";
import type { IssueCategoryBreakdown } from "../../types/dashboard";

// Deliberately scoped to the fully-modeled suppliers only — this does
export function IssueCategoryPanel({ data }: { data: IssueCategoryBreakdown }) {
  return (
    <section className="rounded-xl border border-neutral-100 bg-white p-4">
      <h2 className="font-headline text-base font-semibold text-neutral-900">Issue categories</h2>
      <p className="mb-4 text-xs text-neutral-500">
        Based on persisted vehicle and certificate evidence from {data.modeledSupplierCount} assessed suppliers
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CategoryStat
          icon={<Truck className="h-4 w-4" />}
          label="Vehicle deviations"
          value={data.vehicleDeviation}
          total={data.modeledSupplierCount}
          href="/admin/suppliers?issue=vehicle"
        />
        <CategoryStat
          icon={<BadgeCheck className="h-4 w-4" />}
          label="Certificate issues"
          value={data.certificateExpiry}
          total={data.modeledSupplierCount}
          href="/admin/suppliers?issue=certificate"
        />
        <CategoryStat
          icon={<Zap className="h-4 w-4" />}
          label="Fuel/energy deviations"
          value={data.fuelDeviation}
          total={data.modeledSupplierCount}
        />
      </div>
    </section>
  );
}

function CategoryStat({
  icon,
  label,
  value,
  total,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  total: number;
  /** When set, the tile opens the suppliers list filtered to this category. */
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-neutral-50 p-2 text-neutral-500">{icon}</div>
      <div>
        <div className="font-headline text-lg font-semibold text-neutral-900">
          {value === null ? "Not assessed" : <>{value} <span className="text-xs font-normal text-neutral-500">/ {total}</span></>}
        </div>
        <div className="text-xs font-mono text-neutral-500">{label}</div>
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <Link
      to={href}
      aria-label={`${label}: ${value ?? "not assessed"}, open list`}
      className="block rounded-lg p-1 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
    >
      {content}
    </Link>
  );
}