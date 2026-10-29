import type { ReactNode } from "react";

type Tone = "neutral" | "danger" | "success";

type Props = {
  label: string;
  value: string | number;
  sublabel?: string;
  /** Small highlighted note under the value */
  note?: string;
  noteTone?: Tone;
  inlineNote?: boolean;
  icon?: ReactNode;
  iconClassName?: string;
  valueClassName?: string;
};

const NOTE_TONE_CLASSES: Record<Tone, string> = {
  neutral: "text-neutral-500",
  danger: "text-red-700",
  success: "text-tertiary-700",
};

export function KpiCard({
  label,
  value,
  sublabel,
  note,
  noteTone = "neutral",
  inlineNote = false,
  icon,
  iconClassName,
  valueClassName,
}: Props) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="text-sm font-mono text-neutral-500">{label}</div>
        {icon && (
          <div className={`rounded-lg p-1.5 ${iconClassName ?? "bg-neutral-50 text-neutral-500"}`}>{icon}</div>
        )}
      </div>
      <div className={`mt-1 flex items-baseline ${inlineNote ? "gap-2" : "gap-1.5"}`}>
        <span
          className={`text-2xl font-headline font-semibold ${inlineNote ? "shrink-0" : ""} ${valueClassName ?? "text-neutral-900"}`}
        >
          {value}
        </span>
        {sublabel && <span className="text-xs text-neutral-400">{sublabel}</span>}
        {inlineNote && note && (
          <span className={`min-w-0 flex-1 text-xs font-medium ${NOTE_TONE_CLASSES[noteTone]}`}>
            {note}
          </span>
        )}
      </div>
      {note && !inlineNote && (
        <div className={`mt-1 text-xs font-medium ${NOTE_TONE_CLASSES[noteTone]}`}>{note}</div>
      )}
    </div>
  );
}