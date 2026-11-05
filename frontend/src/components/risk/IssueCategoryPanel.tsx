import { Truck, BadgeCheck, Zap } from "lucide-react";
import type { IssueCategoryBreakdown } from "../../types/dashboard";

// Deliberately scoped to the fully-modeled suppliers only — this does
export function IssueCategoryPanel({ data }: { data: IssueCategoryBreakdown }) {
  return (
    <section className="rounded-xl border border-neutral-100 bg-white p-4">
      <h2 className="font-headline text-base font-semibold text-neutral-900">Issue categories</h2>
      <p className="mb-4 text-xs text-neutral-400">
        Based on persisted vehicle and certificate evidence from {data.modeledSupplierCount} assessed suppliers
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CategoryStat
          icon={<Truck className="h-4 w-4" />}
          label="Vehicle deviations"
          value={data.vehicleDeviation}
          total={data.modeledSupplierCount}
        />
        <CategoryStat
          icon={<BadgeCheck className="h-4 w-4" />}
          label="Certificate issues"
          value={data.certificateExpiry}
          total={data.modeledSupplierCount}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  total: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-neutral-50 p-2 text-neutral-500">{icon}</div>
      <div>
        <div className="font-headline text-lg font-semibold text-neutral-900">
          {value === null ? "Not assessed" : <>{value} <span className="text-xs font-normal text-neutral-400">/ {total}</span></>}
        </div>
        <div className="text-xs font-mono text-neutral-500">{label}</div>
      </div>
    </div>
  );
}