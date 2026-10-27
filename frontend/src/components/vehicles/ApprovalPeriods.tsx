import type { StoredApproval } from "../../types/vehicle";
import { FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../../utils/vehicleCatalog";
import { timestamp } from "../../utils/vehicle";
import { buttonClass, dangerClass } from "./VehicleDialog";

export function ApprovalPeriods({ approvals, busy = false, onEdit, onRevoke }: {
  approvals: StoredApproval[]; busy?: boolean; onEdit?: (approval: StoredApproval) => void; onRevoke?: (approval: StoredApproval) => void;
}) {
  return <section className="space-y-3"><h3 className="font-semibold">Approval periods ({approvals.length})</h3>
    <p className="text-xs text-neutral-500">Periods may overlap for recertification. Conflicting fuel/category values are deviations. Revocation ends coverage from its Oslo date; earlier days remain covered.</p>
    {!approvals.length && <p className="text-sm text-neutral-500">No approval periods recorded.</p>}
    {approvals.map(a => <article key={a.id} id={`approval-${a.id}`} className="rounded-lg border border-neutral-200 p-3">
      <p className="text-sm font-medium">{a.data.startDate} — {a.data.expiryDate ?? "Indefinite"}</p>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-neutral-500">Approved fuel technology</dt><dd>{catalogLabel(FUEL_TECHNOLOGIES, a.data.fuelTechnology)}</dd></div>
        <div><dt className="text-neutral-500">Vehicle category</dt><dd>{catalogLabel(VEHICLE_CATEGORIES, a.data.vehicleCategory)}</dd></div>
        <div><dt className="text-neutral-500">Source / reference</dt><dd>{a.sourceName ?? "Not provided"}</dd></div>
        <div><dt className="text-neutral-500">Revoked</dt><dd>{a.revokedAt ? timestamp(a.revokedAt) : "No"}</dd></div>
      </dl>
      <p className="mt-2 break-all text-xs text-neutral-400">Approval ID: {a.id}</p>
      {!a.revokedAt && (onEdit || onRevoke) && <div className="mt-3 flex flex-wrap gap-2">
        {onEdit && <button disabled={busy} className={buttonClass} aria-label={`Edit approval period ${a.data.startDate} to ${a.data.expiryDate ?? "indefinite"}, ${a.id}`} onClick={() => onEdit(a)}>Edit period</button>}
        {onRevoke && <button disabled={busy} className={dangerClass} aria-label={`Revoke approval period ${a.data.startDate} to ${a.data.expiryDate ?? "indefinite"}, ${a.id}`} onClick={() => onRevoke(a)}>Revoke this period</button>}
      </div>}
    </article>)}
  </section>;
}
