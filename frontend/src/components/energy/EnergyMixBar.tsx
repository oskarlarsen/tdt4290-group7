import { ENERGY_CARRIER_LABELS } from "../../types/energy";
import type { EnergyCarrier } from "../../types/energy";

const CARRIERS: EnergyCarrier[] = ["electric", "biogas", "fossil"];

const CARRIER_COLORS: Record<EnergyCarrier, string> = {
  electric: "bg-primary-900",
  biogas: "bg-tertiary-400",
  fossil: "bg-red-500",
};

// Only carriers actually present are drawn, so a 0% carrier doesn't add noise.
export function EnergyMixBar({ shares }: { shares: Record<EnergyCarrier, number> }) {
  const visible = CARRIERS.filter((c) => shares[c] > 0);
  const description = visible
    .map((c) => `${Math.round(shares[c])}% ${ENERGY_CARRIER_LABELS[c]}`)
    .join(", ");

  return (
    <div className="min-w-50">
      <div
        role="img"
        aria-label={`Energy mix: ${description}`}
        className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-100"
      >
        {visible.map((c) => (
          <div key={c} className={CARRIER_COLORS[c]} style={{ width: `${shares[c]}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
        {visible.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${CARRIER_COLORS[c]}`} />
            {Math.round(shares[c])}% {ENERGY_CARRIER_LABELS[c]}
          </span>
        ))}
      </div>
    </div>
  );
}