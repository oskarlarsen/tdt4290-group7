import type { RiskClassification } from "../../types/dashboard";

const SEGMENT_CLASSES = {
  compliant: "bg-neutral-500",
  medium: "bg-amber-400",
  high: "bg-red-500",
};

const DOT_CLASSES = {
  compliant: "bg-neutral-500",
  medium: "bg-amber-400",
  high: "bg-red-500",
};

export function RiskClassificationBar({ data }: { data: RiskClassification }) {
  const total = data.compliant.count + data.medium.count + data.high.count;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className={SEGMENT_CLASSES.compliant} style={{ width: `${data.compliant.percent}%` }} />
        <div className={SEGMENT_CLASSES.medium} style={{ width: `${data.medium.percent}%` }} />
        <div className={SEGMENT_CLASSES.high} style={{ width: `${data.high.percent}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Legend
          dotClass={DOT_CLASSES.compliant}
          label="No flagged evidence"
          count={data.compliant.count}
          percent={data.compliant.percent}
        />
        <Legend
          dotClass={DOT_CLASSES.medium}
          label="Medium risk"
          count={data.medium.count}
          percent={data.medium.percent}
        />
        <Legend
          dotClass={DOT_CLASSES.high}
          label="High risk"
          count={data.high.count}
          percent={data.high.percent}
        />
        <span className="ml-auto font-mono text-xs text-neutral-400">{total} suppliers total</span>
      </div>
    </div>
  );
}

function Legend({
  dotClass,
  label,
  count,
  percent,
}: {
  dotClass: string;
  label: string;
  count: number;
  percent: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="font-medium text-neutral-800">{count} suppliers</span>
      <span className="font-mono text-xs text-neutral-400">
        ({percent}%) {label}
      </span>
    </span>
  );
}