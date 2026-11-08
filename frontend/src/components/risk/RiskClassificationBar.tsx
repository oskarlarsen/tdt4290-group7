import { Link } from "react-router-dom";
import type { RiskClassification } from "../../types/dashboard";

type Level = "high" | "medium" | "compliant" | "unassessed";

// High risk first, so the list says where to start. Each row opens the suppliers list at that level.
const ROWS: { level: Level; label: string; dotClass: string; barClass: string }[] = [
  { level: "high", label: "High risk", dotClass: "bg-red-500", barClass: "bg-red-500" },
  { level: "medium", label: "Medium risk", dotClass: "bg-amber-400", barClass: "bg-amber-400" },
  { level: "compliant", label: "No flagged evidence", dotClass: "bg-neutral-500", barClass: "bg-neutral-500" },
  { level: "unassessed", label: "Not assessed", dotClass: "bg-neutral-300", barClass: "bg-neutral-300" },
];

export function RiskClassificationBar({ data }: { data: RiskClassification }) {
  const total = ROWS.reduce((sum, row) => sum + data[row.level].count, 0);

  return (
    <div>
      <ul className="space-y-2">
        {ROWS.map(({ level, label, dotClass, barClass }) => {
          const { count, percent } = data[level];
          return (
            <li key={level}>
              <Link
                to={`/admin/suppliers?risk=${level}`}
                aria-label={`${count} suppliers, ${label}: open list`}
                className="block rounded-lg px-2 py-1.5 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
              >
                <span className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                  <span className="font-medium text-neutral-800">{count} suppliers</span>
                  <span className="font-mono text-xs text-neutral-500">({percent}%) {label}</span>
                </span>
                <span className="mt-1 block h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                  <span className={`block h-full ${barClass}`} style={{ width: `${percent}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-right font-mono text-xs text-neutral-500">{total} suppliers total</p>
    </div>
  );
}
