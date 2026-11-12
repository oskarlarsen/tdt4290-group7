import { StatusBadge } from "../ui/StatusBadge";
import { RISK_PRIORITY_INFO, formatDaysUntil } from "../../types/riskOutlook";
import { formatCertificateDate } from "../../types/certificate";
import type { RiskOutlookRow } from "../../types/riskOutlook";

export function RiskOutlookTable({
  rows,
  onSelect,
  emptyMessage = "Ingen avtaler å vise.",
}: {
  rows: RiskOutlookRow[];
  onSelect: (row: RiskOutlookRow) => void;
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
            <th scope="col" className="pb-2 pr-3 font-medium">Leverandør og org.nr.</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Avtale</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Hovedrisikofaktor</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Neste predikerte brudd</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Risikoprioritet</th>
            <th scope="col" className="pb-2 font-medium">Handling</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { contract, primary, nextProjected, priority } = row;
            const info = RISK_PRIORITY_INFO[priority];
            const extra = row.indicators.length - 1;
            const days = nextProjected?.daysUntil ?? null;
            const isSoon = days !== null && days <= 30;

            return (
              <tr key={contract.id} className="border-t border-neutral-100">
                <td className="py-3 pr-3">
                  <div className="font-medium text-neutral-900">{contract.supplierName}</div>
                  <div className="font-mono text-xs text-neutral-500">{contract.supplierOrgId}</div>
                </td>
                <td className="py-3 pr-3 text-neutral-700">{contract.contractName}</td>
                <td className="min-w-55 py-3 pr-3">
                  {primary ? (
                    <div>
                      <div className="font-medium text-neutral-900">{primary.title}</div>
                      <div className="text-xs text-neutral-500">{primary.detail}</div>
                      {extra > 0 && (
                        <div className="mt-0.5 text-xs text-neutral-500">
                          +{extra} {extra === 1 ? "indikator til" : "indikatorer til"}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-500">Ingen risikoindikatorer</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {nextProjected && nextProjected.date && days !== null ? (
                    <>
                      <div className={`whitespace-nowrap font-medium ${isSoon ? "text-red-700" : "text-neutral-900"}`}>
                        {formatCertificateDate(nextProjected.date)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {nextProjected.title} · {formatDaysUntil(days)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-neutral-500">—</div>
                      <div className="text-xs text-neutral-500">Ingen kommende utløp registrert</div>
                    </>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <StatusBadge status={info.tone} label={info.label} />
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