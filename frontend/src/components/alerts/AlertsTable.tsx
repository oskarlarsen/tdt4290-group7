import { AlertStatusBadge, SeverityBadge } from "./AlertBadges";
import type { RecentAlert } from "../../types/dashboard";
import type { DerivedContract } from "../../types/contract";

// contract is optional: not every alert is linked to a supplier, and a link can't always
// be resolved to a contract.
export type AlertRow = { alert: RecentAlert; contract?: DerivedContract };

export function AlertsTable({
  rows,
  onSelect,
  emptyMessage = "No alerts to show.",
}: {
  rows: AlertRow[];
  onSelect: (row: AlertRow) => void;
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
            <th className="pb-2 pr-3 font-medium">Supplier &amp; contract</th>
            <th className="pb-2 pr-3 font-medium">Alert &amp; summary</th>
            <th className="pb-2 pr-3 font-medium">Severity &amp; time</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { alert, contract } = row;
            return (
              <tr key={alert.id} className="border-t border-neutral-100">
                <td className="py-3 pr-3">
                  {contract ? (
                    <>
                      <div className="font-medium text-neutral-900">{contract.supplierName}</div>
                      <div className="font-mono text-xs text-neutral-400">{contract.supplierOrgId}</div>
                      <div className="text-xs text-neutral-500">{contract.contractName}</div>
                    </>
                  ) : (
                    <span className="text-xs text-neutral-400">No linked supplier</span>
                  )}
                </td>
                <td className="min-w-60 py-3 pr-3">
                  <div className="font-medium text-neutral-900">{alert.title}</div>
                  <div className="text-xs text-neutral-500">{alert.description}</div>
                </td>
                <td className="whitespace-nowrap py-3 pr-3">
                  <SeverityBadge severity={alert.severity} />
                  <div className="mt-1 font-mono text-xs text-neutral-400">{alert.timeAgo}</div>
                </td>
                <td className="py-3 pr-3">
                  <AlertStatusBadge status={alert.status} />
                </td>
                <td className="py-3">
                  <button
                    onClick={() => onSelect(row)}
                    className="whitespace-nowrap rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
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