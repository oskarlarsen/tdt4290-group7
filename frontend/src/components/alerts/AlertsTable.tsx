import { Archive, ArchiveRestore } from "lucide-react";
import { AlertFindingBadge, AlertStatusBadge, SeverityBadge } from "./AlertBadges";
import type { RecentAlert, TopRiskSupplier } from "../../types/dashboard";
import { formatAlertCreatedDate } from "../../utils/alertAge";

// The agreement is optional: not every alert is linked to a supplier, and a link can't always
// be resolved to an agreement.
export type AlertContract = { supplierId: string; supplierName: string; supplierOrgId: string; contractName: string };

export type AlertRow = {
  alert: RecentAlert;
  contract?: AlertContract;
  supplier?: Pick<TopRiskSupplier, "id" | "displayName" | "orgId" | "primaryContract">;
};

export function AlertsTable({
  rows,
  onSelect,
  onArchive,
  onRestore,
  emptyMessage = "Ingen varsler å vise",
}: {
  rows: AlertRow[];
  onSelect: (row: AlertRow) => void;
  onArchive: (row: AlertRow) => void;
  onRestore: (row: AlertRow) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-neutral-500">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-500">
            <th scope="col" className="pb-2 pr-3 font-medium">Beskrivelse</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Leverandør</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Avtale</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Risiko</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Status</th>
            <th scope="col" className="whitespace-nowrap pb-2 pr-3 font-medium">Opprettet</th>
            <th scope="col" className="pb-2 font-medium">Handling</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { alert, contract, supplier } = row;
            return (
              <tr key={alert.id} className="border-t border-neutral-100">
                <td className="min-w-60 py-3 pr-3">
                  <div className="font-medium text-neutral-900">{alert.title}</div>
                  <div className="text-xs text-neutral-500">{alert.description}</div>
                  {alert.findingType && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="text-xs text-neutral-500">Varseltype:</span>
                      <AlertFindingBadge findingType={alert.findingType} />
                    </div>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {contract || supplier ? (
                    <>
                      <div className="font-medium text-neutral-900">
                        {contract?.supplierName ?? supplier?.displayName}
                      </div>
                      <div className="font-mono text-xs text-neutral-500">
                        {contract?.supplierOrgId ?? supplier?.orgId}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-neutral-500">Ikke tilgjengelig</span>
                  )}
                </td>
                <td className="max-w-[14rem] break-words py-3 pr-6">
                  {contract || supplier ? (
                    <span className="text-xs text-neutral-700">
                      {contract?.contractName ?? supplier?.primaryContract}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-500">Ikke tilgjengelig</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-3 pr-3">
                  <SeverityBadge severity={alert.severity} />
                </td>
                <td className="py-3 pr-3">
                  <AlertStatusBadge status={alert.status} />
                </td>
                <td className="whitespace-nowrap py-3 pr-3 font-mono text-xs text-neutral-500">
                  {formatAlertCreatedDate(alert.createdAt)}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => onSelect(row)}
                    aria-label={`Vis detaljer for ${alert.title}`}
                    className="whitespace-nowrap rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                  >
                    Vis detaljer
                  </button>
                  {alert.archivedAt ? (
                    <button
                      onClick={() => onRestore(row)}
                      aria-label={`Gjenopprett ${alert.title}`}
                      className="mt-1 inline-flex h-7 w-[95px] items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      <ArchiveRestore className="h-3 w-3" />
                      Gjenopprett
                    </button>
                  ) : (
                    <button
                      onClick={() => onArchive(row)}
                      aria-label={`Arkiver ${alert.title}`}
                      className="mt-1 inline-flex h-7 w-[95px] items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      <Archive className="h-3 w-3" />
                      Arkiver
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}