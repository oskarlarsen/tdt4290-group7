import type { ApprovalStatus, VehicleOverview } from "../../types/vehicle";
import { APPROVAL_LABELS, checkLabel, humanize, timestamp } from "../../utils/vehicle";
export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{APPROVAL_LABELS[status]}</span>;
}
export function VehicleTable({ items, onOpen }: { items: VehicleOverview[]; onOpen: (plate: string) => void }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500"><tr>{["Registration number", "Current approval", "Latest check result", "SVV source", "Last check"].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-neutral-100">{items.map(item => <tr key={item.vehicle.registrationNumber} className="hover:bg-neutral-50">
      <td className="px-4 py-4"><button className="font-mono font-semibold text-primary-900 underline decoration-neutral-300 underline-offset-4" onClick={() => onOpen(item.vehicle.registrationNumber)}>{item.vehicle.registrationNumber}</button></td>
      <td className="px-4 py-4"><ApprovalBadge status={item.approvalStatus} /></td>
      <td className="px-4 py-4"><span className={item.latestCheck?.deviations.length ? "text-red-800" : "text-neutral-700"}>{checkLabel(item.latestCheck)}</span></td>
      <td className="px-4 py-4"><span className="capitalize">{item.latestCheck ? humanize(item.latestCheck.dataSource) : "Not available"}</span>{item.latestCheck?.fetchedAt && <div className="mt-1 text-xs text-neutral-500">Retrieved {timestamp(item.latestCheck.fetchedAt)}</div>}</td>
      <td className="px-4 py-4 text-neutral-600">{timestamp(item.latestCheck?.checkedAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}
