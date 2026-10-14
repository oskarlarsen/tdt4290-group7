import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/** Separate from the input label so tapping help never activates a disabled/other control. */
export function FieldTooltip({ label, text }: { label: string; text: string }) {
  const id = useId(); const ref = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false); const [focused, setFocused] = useState(false); const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;
  useEffect(() => {
    if (!pinned) return;
    const dismiss = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setPinned(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [pinned]);
  return <span ref={ref} className="absolute right-0 top-0 z-20" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <button type="button" aria-label={`Help for ${label}`} aria-describedby={id} aria-expanded={open}
      className="rounded p-0.5 text-neutral-400 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30"
      onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setPinned(false); }}
      onClick={() => { setPinned(!pinned); setFocused(false); setHovered(false); }}
      onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setPinned(false); setFocused(false); setHovered(false); } }}>
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
    <span id={id} role="tooltip" hidden={!open} className="absolute right-0 top-full mt-1 w-64 max-w-[calc(100vw-3rem)] rounded-lg bg-neutral-900 px-3 py-2 text-xs leading-5 text-white shadow-lg">{text}</span>
  </span>;
}
