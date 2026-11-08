import { useNavigate } from "react-router-dom";
import { getEnvironmentalComplianceLabel } from "../../types/contract";
import type { DerivedContract } from "../../types/contract";

const STATUS_CLASSES: Record<DerivedContract["status"], string> = {
  Active: "bg-tertiary-100 text-tertiary-700",
  "Expiring Soon": "bg-amber-100 text-amber-800",
  Expired: "bg-red-100 text-red-700",
};

const COMPLIANCE_CLASSES: Record<DerivedContract["risk"], string> = {
  unassessed: "bg-neutral-100 text-neutral-600",
  compliant: "bg-tertiary-100 text-tertiary-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-700",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ContractsTable({
  contracts,
  onViewDetails,
}: {
  contracts: DerivedContract[];
  onViewDetails: (contract: DerivedContract) => void;
}) {
  const navigate = useNavigate();

  if (contracts.length === 0) {
    return <div className="py-8 text-center text-sm text-neutral-500">No contracts to show.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-500">
            <th scope="col" className="pb-2 pr-3 font-medium">Contract</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Linked supplier</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Contract status</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Start date</th>
            <th scope="col" className="pb-2 pr-3 font-medium">End date</th>
            <th scope="col" className="pb-2 pr-3 font-medium">Environmental compliance</th>
            <th scope="col" className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <tr key={c.id} className="border-t border-neutral-100">
              <td className="py-3 pr-3 font-medium text-neutral-900">{c.contractName}</td>

              <td className="py-3 pr-3">
                <button
                  onClick={() => navigate(`/admin/suppliers?supplierId=${c.supplierId}`)}
                  className="text-left text-neutral-700 hover:text-primary-900 hover:underline"
                >
                  {c.supplierName}
                </button>
                <div className="font-mono text-xs text-neutral-500">{c.supplierOrgId}</div>
              </td>

              <td className="py-3 pr-3">
                <span className={`rounded px-2 py-0.5 text-xs font-mono font-medium ${STATUS_CLASSES[c.status]}`}>
                  {c.status}
                </span>
              </td>

              <td className="py-3 pr-3 whitespace-nowrap text-neutral-700">{formatDate(c.startDate)}</td>
              <td className="py-3 pr-3 whitespace-nowrap text-neutral-700">{formatDate(c.endDate)}</td>

              <td className="py-3 pr-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-mono font-medium ${COMPLIANCE_CLASSES[c.risk]}`}
                >
                  {c.risk === "medium" ? "Partial" : getEnvironmentalComplianceLabel(c.risk)}
                </span>
              </td>

              <td className="py-3">
                <button
                  onClick={() => onViewDetails(c)}
                  className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                >
                  View details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}