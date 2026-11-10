import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
  /** When set, the whole card is a link to a filtered list. */
  href?: string;
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
  href,
}: Props) {
  const card = (
    <div className={`rounded-xl border border-neutral-100 bg-white p-4 ${href ? "hover:border-neutral-300" : ""}`}>
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
        {sublabel && <span className="text-xs text-neutral-500">{sublabel}</span>}
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
  if (!href) return card;
  return (
    <Link
      to={href}
      aria-label={`${label}: ${value}${sublabel ? ` ${sublabel}` : ""}, open list`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
    >
      {card}
    </Link>
  );
}