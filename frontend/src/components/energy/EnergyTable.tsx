import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import { ENERGY_STATUS_LABELS, ENERGY_STATUS_TONES, formatKwh, formatSignedKwh, isEnergyYearClosed } from "../../types/energy";
import type { EnergyContract } from "../../types/energy";
import type { EnergySortDirection, EnergySortKey } from "./energyFilters";

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
}: {
  label: string;
  sortKey: EnergySortKey;
  active: EnergySortKey;
  direction: EnergySortDirection;
  onSort: (key: EnergySortKey) => void;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"} className="pb-2 pr-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-mono uppercase tracking-wide hover:text-neutral-900"
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "text-neutral-900" : "text-neutral-400"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

// While the year is open the figure is the projected year-end deviation, not delivered minus committed, so say so.
function Deviation({ kwh, projected }: { kwh: number | null; projected: boolean }) {
  if (kwh === null) return <div className="text-xs text-neutral-500">Ingen forpliktelse</div>;
  return (
    <div className={`text-xs ${kwh < 0 ? "text-red-700" : "text-tertiary-700"}`}>
      {projected ? "Anslått " : ""}
      {formatSignedKwh(kwh)} mot forpliktelsen
    </div>
  );
}

export function EnergyTable({
  rows,
  sortKey,
  sortDirection,
  onSort,
  onSelect,
  emptyMessage = "Ingen energioppføringer å vise.",
}: {
  rows: EnergyContract[];
  sortKey: EnergySortKey;
  sortDirection: EnergySortDirection;
  onSort: (key: EnergySortKey) => void;
  onSelect: (row: EnergyContract) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-neutral-500">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500">
            <SortHeader label="Leverandør og org.nr." sortKey="supplier" active={sortKey} direction={sortDirection} onSort={onSort} />
            <th scope="col" className="pb-2 pr-3 font-mono font-medium uppercase tracking-wide">Avtale</th>
            <th scope="col" className="pb-2 pr-3 font-mono font-medium uppercase tracking-wide">Egenprodusert</th>
            <th scope="col" className="pb-2 pr-3 font-mono font-medium uppercase tracking-wide">Opprinnelsesgarantier</th>
            <SortHeader label="Status" sortKey="status" active={sortKey} direction={sortDirection} onSort={onSort} />
            <th scope="col" className="pb-2 font-mono font-medium uppercase tracking-wide">Handling</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasData = row.reportedQuarters.length > 0;
            const projected = !isEnergyYearClosed(row);
            return (
              <tr key={row.agreementId} className="border-t border-neutral-100">
                <td className="py-3 pr-3">
                  <div className="font-medium text-neutral-900">{row.supplierName}</div>
                  <div className="font-mono text-xs text-neutral-500">{row.orgNumber}</div>
                </td>
                <td className="py-3 pr-3 text-neutral-700">{row.saksnr ?? "—"}</td>
                <td className="py-3 pr-3">
                  {hasData ? (
                    <>
                      <div className="font-medium text-neutral-900">
                        {formatKwh(row.selfProducedKwh)}
                        {row.commitment && <span className="font-normal text-neutral-500"> av {formatKwh(row.commitment.minSelfProducedKwh)}</span>}
                      </div>
                      <Deviation kwh={row.selfProducedDeviationKwh} projected={projected} />
                    </>
                  ) : (
                    <span className="text-xs text-neutral-500">Ikke rapportert</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {hasData ? (
                    <>
                      <div className="font-medium text-neutral-900">
                        {formatKwh(row.gooCoveredKwh)}
                        {row.commitment && <span className="font-normal text-neutral-500"> av {formatKwh(row.commitment.minGooKwh)}</span>}
                      </div>
                      <Deviation kwh={row.gooDeviationKwh} projected={projected} />
                    </>
                  ) : (
                    <span className="text-xs text-neutral-500">Ikke rapportert</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <StatusBadge status={ENERGY_STATUS_TONES[row.status]} label={ENERGY_STATUS_LABELS[row.status]} />
                </td>
                <td className="py-3">
                  <button
                    onClick={() => onSelect(row)}
                    className="whitespace-nowrap rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                  >
                    Vis detaljer
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
