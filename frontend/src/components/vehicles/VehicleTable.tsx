import type { ApprovalStatus, VehicleOverview } from "../../types/vehicle";
import { APPROVAL_LABELS, checkLabel, humanize, timestamp } from "../../utils/vehicle";
import { StatusBadge } from "../ui/StatusBadge";
export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return <StatusBadge status={status === "ACTIVE" ? "tertiary" : "yellow"} label={APPROVAL_LABELS[status]} />;
}
export function VehicleTable({ items, onOpen }: { items: VehicleOverview[]; onOpen: (plate: string) => void }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="text-xs font-mono uppercase tracking-wide text-neutral-400"><tr>{["Registration number", "Current approval", "Latest check result", "Statens Vegvesen source", "Last check"].map(label => <th key={label} scope="col" className="pb-2 pr-3 font-medium">{label}</th>)}</tr></thead>
    <tbody>{items.map(item => <tr key={item.vehicle.registrationNumber} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
      <td className="py-3 pr-3"><button className="rounded font-mono font-medium text-neutral-900 hover:text-primary-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" onClick={() => onOpen(item.vehicle.registrationNumber)}>{item.vehicle.registrationNumber}</button></td>
      <td className="py-3 pr-3"><ApprovalBadge status={item.approvalStatus} /></td>
      <td className="py-3 pr-3"><span className={(item.latestCheck?.highPriorityCount ?? 0) > 0 ? "text-red-700" : item.latestCheck?.deviations.length ? "text-amber-800" : "text-neutral-700"}>{checkLabel(item.latestCheck)}</span></td>
      <td className="py-3 pr-3 text-neutral-700"><span className="capitalize">{item.latestCheck ? humanize(item.latestCheck.dataSource) : "Not available"}</span>{item.latestCheck?.fetchedAt && <div className="mt-1 text-xs text-neutral-400">Retrieved {timestamp(item.latestCheck.fetchedAt)}</div>}</td>
      <td className="py-3 text-xs text-neutral-500">{timestamp(item.latestCheck?.checkedAt)}</td>
    </tr>)}</tbody>
  </table></div>;
}
