import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Moves focus into an open drawer, keeps Tab inside it, and gives focus back to the opener on close. */
export function useDrawerFocus(isOpen: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const drawer = ref.current;
    if (!isOpen || !drawer) return;
    const opener = document.activeElement as HTMLElement | null;
    drawer.focus();
    function trapTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !drawer) return;
      const items = drawer.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first) e.preventDefault();
      else if (e.shiftKey && (active === first || active === drawer)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", trapTab);
    return () => { document.removeEventListener("keydown", trapTab); opener?.focus(); };
  }, [isOpen]);
  return ref;
}
