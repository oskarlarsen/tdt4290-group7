import { Building2, ShieldAlert, Clock3, CheckCircle2, Download, Plus } from "lucide-react";
import { KpiCard } from "../ui/KpiCard";

type Props = {
  monitoredSuppliers: number;
  modeledSupplierCount: number;
  highCount: number;
  mediumCount: number;
  compliantCount: number;
  compliantPercent: number;
  onExport: () => void;
  onAddSupplier: () => void;
};

// Risk totals are based on suppliers with persisted vehicle or certificate evidence.
export function SuppliersOverviewHeader({
  monitoredSuppliers,
  modeledSupplierCount,
  highCount,
  mediumCount,
  compliantCount,
  compliantPercent,
  onExport,
  onAddSupplier,
}: Props) {
  const cards = [
    {
      label: "MONITORED SUPPLIERS",
      value: monitoredSuppliers,
      valueClass: "text-black",
      sublabel: `of ${modeledSupplierCount} suppliers; the rest have no checks or certificates yet`,
      icon: Building2,
      iconStyle: "bg-primary-100 text-primary-900",
    },
    {
      label: "HIGH RISK",
      value: highCount,
      valueClass: "text-black",
      sublabel: "Assessed suppliers with high-priority findings",
      icon: ShieldAlert,
      iconStyle: "bg-red-100 text-red-700",
    },
    {
      label: "MEDIUM RISK",
      value: mediumCount,
      valueClass: "text-black",
      sublabel: "Assessed suppliers with findings to review",
      icon: Clock3,
      iconStyle: "bg-amber-100 text-amber-700",
    },
    {
      label: "NO FLAGGED EVIDENCE",
      value: compliantCount,
      valueClass: "text-black",
      sublabel: `${compliantPercent}% of all suppliers`,
      icon: CheckCircle2,
      iconStyle: "bg-tertiary-100 text-tertiary-700",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              Municipal Oversight
            </div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Municipal Suppliers
            </h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-6 text-[#5c6773]">
              Monitor supplier environmental compliance, risk levels, and issues requiring attention.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onExport}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-[#dfe3e8] bg-[#f5f7f8] px-3 text-xs font-medium text-[#1f2937] shadow-sm transition-colors hover:bg-[#eef2f5]"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              onClick={onAddSupplier}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1f4d46] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#173a34]"
            >
              <Plus className="h-4 w-4" />
              Add supplier
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, valueClass, sublabel, icon: Icon, iconStyle }) => (
          <KpiCard
            key={label}
            label={label}
            value={value}
            sublabel={sublabel}
            icon={<Icon className="h-4 w-4" />}
            iconClassName={iconStyle}
            valueClassName={valueClass}
          />
        ))}
      </div>

    </div>
  );
}