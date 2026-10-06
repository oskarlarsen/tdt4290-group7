import type { ReactNode } from "react";

type Tone = "neutral" | "danger" | "success";

type Props = {
  label: string;
  value: string | number;
  sublabel?: string;
  /** Small highlighted note under the value */
  note?: string;
  noteTone?: Tone;
  icon?: ReactNode;
};

const NOTE_TONE_CLASSES: Record<Tone, string> = {
  neutral: "text-neutral-500",
  danger: "text-red-700",
  success: "text-tertiary-700",
};

export function KpiCard({ label, value, sublabel, note, noteTone = "neutral", icon }: Props) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="text-sm font-mono text-neutral-500">{label}</div>
        {icon && (
          <div className="rounded-lg bg-neutral-50 p-1.5 text-neutral-500">{icon}</div>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-headline font-semibold text-neutral-900">{value}</span>
        {sublabel && <span className="text-xs text-neutral-400">{sublabel}</span>}
      </div>
      {note && <div className={`mt-1 text-xs font-medium ${NOTE_TONE_CLASSES[noteTone]}`}>{note}</div>}
    </div>
  );
}