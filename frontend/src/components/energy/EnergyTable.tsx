import { StatusBadge } from "../ui/StatusBadge";
import { EnergyMixBar } from "./EnergyMixBar";
import { formatPercent } from "../../types/energy";
import { getEnergyStatusLabel } from "./energyFilters";
import type { EnergyAnalysis, EnergyRecord, EnergyRequirement } from "../../types/energy";
import type { DerivedContract } from "../../types/contract";

// contract is optional: shown "where available" if a record's contract can't be found.
export type EnergyRow = {
  kind?: "record";
  record: EnergyRecord;
  requirement: EnergyRequirement;
  contract?: DerivedContract;
  analysis: EnergyAnalysis;
};

export type MissingEnergyRow = {
  kind: "missing";
  id: string;
  contract: DerivedContract;
  requirement: EnergyRequirement;
};

export type EnergyTableRow = EnergyRow | MissingEnergyRow;

const SHARE_CLASSES: Record<EnergyAnalysis["status"], string> = {
  breach: "text-red-700",
  "minor-deviation": "text-amber-700",
  compliant: "text-neutral-900",
};

export function EnergyTable({
  rows,
  onSelect,
  emptyMessage = "No energy records to show.",
}: {
  rows: EnergyTableRow[];
  onSelect: (row: EnergyRow) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-neutral-400">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-400">
            <th className="pb-2 pr-3 font-medium">Supplier &amp; org no.</th>
            <th className="pb-2 pr-3 font-medium">Contract</th>
            <th className="pb-2 pr-3 font-medium">Energy / fuel mix</th>
            <th className="pb-2 pr-3 font-medium">Renewable share</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === "missing") {
              return (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="py-3 pr-3">
                    <div className="font-medium text-neutral-900">{row.contract.supplierName}</div>
                    <div className="font-mono text-xs text-neutral-400">{row.contract.supplierOrgId}</div>
                  </td>
                  <td className="py-3 pr-3 text-neutral-700">{row.contract.contractName}</td>
                  <td className="py-3 pr-3 text-xs text-neutral-400">No assessable quarterly data</td>
                  <td className="py-3 pr-3">
                    <div className="text-xs text-neutral-400">Not assessed</div>
                    <div className="text-xs text-neutral-400">
                      min {formatPercent(row.requirement.minRenewableSharePercent)} req.
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="inline-block whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-xs font-mono font-medium text-amber-700">
                      Missing data
                    </span>
                  </td>
                  <td className="py-3 text-neutral-400">—</td>
                </tr>
              );
            }

            const { record, requirement, contract, analysis } = row;
            return (
              <tr key={record.id} className="border-t border-neutral-100">
                <td className="py-3 pr-3">
                  {contract ? (
                    <>
                      <div className="font-medium text-neutral-900">{contract.supplierName}</div>
                      <div className="font-mono text-xs text-neutral-400">{contract.supplierOrgId}</div>
                    </>
                  ) : (
                    <span className="text-xs text-neutral-400">Contract not found</span>
                  )}
                </td>
                <td className="py-3 pr-3 text-neutral-700">{contract?.contractName ?? "—"}</td>
                <td className="py-3 pr-3">
                  <EnergyMixBar shares={analysis.shares} />
                </td>
                <td className="py-3 pr-3">
                  <div className={`font-medium ${SHARE_CLASSES[analysis.status]}`}>
                    {formatPercent(analysis.renewableSharePercent)}
                  </div>
                  <div className="text-xs text-neutral-400">
                    min {formatPercent(requirement.minRenewableSharePercent)} req.
                  </div>
                </td>
                <td className="py-3 pr-3">
                  <StatusBadge status={analysis.tone} label={getEnergyStatusLabel(analysis.status)} />
                </td>
                <td className="py-3">
                  <button
                    onClick={() => onSelect(row)}
                    className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                  >
                    View Details
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