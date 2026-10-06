import { useNavigate } from "react-router-dom";
import { RiskBadge } from "../ui/RiskBadge";
import type { TopRiskSupplier } from "../../types/dashboard";

export function TopRiskSuppliersTable({ suppliers }: { suppliers: TopRiskSupplier[] }) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-400">
            <th className="pb-2 pr-3 font-medium">Supplier &amp; org ID</th>
            <th className="pb-2 pr-3 font-medium">Primary contract</th>
            <th className="pb-2 pr-3 font-medium">Risk</th>
            <th className="pb-2 pr-3 font-medium">Main issue</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-t border-neutral-100">
              <td className="py-3 pr-3">
                <div className="font-medium text-neutral-900">{s.displayName}</div>
                <div className="font-mono text-xs text-neutral-400">{s.orgId}</div>
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.primaryContract}</td>
              <td className="py-3 pr-3">
                <RiskBadge level={s.risk} />
              </td>
              <td className="py-3 pr-3 text-neutral-700">{s.mainIssue}</td>
              <td className="py-3">
                <button
                  // TODO: Connect this route when the Supplier Details page is implemented
                  onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                  className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                >
                  Investigate
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}