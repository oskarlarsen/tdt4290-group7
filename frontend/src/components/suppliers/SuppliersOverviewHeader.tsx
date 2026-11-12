import { Building2, ShieldAlert, Clock3, Eye, CheckCircle2, Download, Plus } from "lucide-react";
import { KpiCard } from "../ui/KpiCard";

type Props = {
  monitoredSuppliers: number;
  modeledSupplierCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** The risk level the list below is filtered to; its card shows as pressed. */
  activeRisk: "all" | "high" | "medium" | "low" | "compliant" | "unassessed";
  onSelectRisk: (level: "high" | "medium" | "low" | "compliant") => void;
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
  lowCount,
  activeRisk,
  onSelectRisk,
  compliantCount,
  compliantPercent,
  onExport,
  onAddSupplier,
}: Props) {
  const cards: {
    label: string; value: number; valueClass: string; sublabel: string; icon: typeof Building2; iconStyle: string;
    level?: "high" | "medium" | "low" | "compliant";
  }[] = [
    {
      label: "OVERVÅKEDE LEVERANDØRER",
      value: monitoredSuppliers,
      valueClass: "text-black",
      sublabel: `av ${modeledSupplierCount} leverandører; resten har ingen sjekker eller sertifikater ennå`,
      icon: Building2,
      iconStyle: "bg-primary-100 text-primary-900",
    },
    {
      label: "HØY RISIKO",
      value: highCount,
      valueClass: "text-black",
      sublabel: "Samlet funnpoengsum 10 eller mer",
      level: "high",
      icon: ShieldAlert,
      iconStyle: "bg-red-100 text-red-700",
    },
    {
      label: "MIDDELS RISIKO",
      value: mediumCount,
      valueClass: "text-black",
      sublabel: "Samlet funnpoengsum 4 til 9",
      level: "medium",
      icon: Clock3,
      iconStyle: "bg-amber-100 text-amber-700",
    },
    {
      label: "LAV RISIKO",
      value: lowCount,
      valueClass: "text-black",
      sublabel: "Samlet funnpoengsum 1 til 3",
      icon: Eye,
      iconStyle: "bg-sky-100 text-sky-700",
      level: "low",
    },
    {
      label: "INGEN FUNN",
      value: compliantCount,
      valueClass: "text-black",
      sublabel: `${compliantPercent} % av alle leverandører`,
      icon: CheckCircle2,
      iconStyle: "bg-tertiary-100 text-tertiary-700",
      level: "compliant",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6b7280]">
              Kommunal oversikt
            </div>
            <h1 className="mt-2 font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Kommunale leverandører
            </h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-6 text-[#5c6773]">
              Følg opp leverandørenes miljøavvik, risikonivåer og saker som krever oppmerksomhet.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onExport}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg border border-[#dfe3e8] bg-[#f5f7f8] px-3 text-xs font-medium text-[#1f2937] shadow-sm transition-colors hover:bg-[#eef2f5]"
            >
              <Download className="h-4 w-4" />
              Eksporter
            </button>
            <button
              type="button"
              onClick={onAddSupplier}
              className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg bg-[#1f4d46] px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#173a34]"
            >
              <Plus className="h-4 w-4" />
              Legg til leverandør
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, value, valueClass, sublabel, icon: Icon, iconStyle, level }) => (
          <KpiCard
            key={label}
            label={label}
            value={value}
            sublabel={sublabel}
            icon={<Icon className="h-4 w-4" />}
            iconClassName={iconStyle}
            valueClassName={valueClass}
            onClick={level ? () => onSelectRisk(level) : undefined}
            pressed={level ? activeRisk === level : false}
          />
        ))}
      </div>

    </div>
  );
}