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
  /** When set, the whole card is a button; `pressed` marks the active one. */
  onClick?: () => void;
  pressed?: boolean;
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
  onClick,
  pressed = false,
}: Props) {
  const card = (
    <div className={`h-full rounded-xl border border-neutral-100 bg-white p-4 ${href || onClick ? "hover:border-neutral-300" : ""} ${pressed ? "border-primary-700 ring-2 ring-primary-700/20" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-sm font-mono text-neutral-500">{label}</div>
        {icon && (
          <div className={`rounded-lg p-1.5 ${iconClassName ?? "bg-neutral-50 text-neutral-500"}`}>{icon}</div>
        )}
      </div>
      <div className={`mt-1 flex flex-wrap items-baseline ${inlineNote ? "gap-2" : "gap-x-1.5"}`}>
        <span
          className={`whitespace-nowrap text-2xl font-headline font-semibold ${inlineNote ? "shrink-0" : ""} ${valueClassName ?? "text-neutral-900"}`}
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
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
      >
        {card}
      </button>
    );
  }
  if (!href) return card;
  return (
    <Link
      to={href}
      aria-label={`${label}: ${value}${sublabel ? ` ${sublabel}` : ""}, åpne liste`}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/40"
    >
      {card}
    </Link>
  );
}