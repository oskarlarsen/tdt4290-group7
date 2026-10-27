import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { FieldTooltip } from "./FieldTooltip";

export const inputClass = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 placeholder:text-neutral-400 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10 disabled:bg-neutral-50 read-only:bg-neutral-50";
const buttonBase = "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonClass = `${buttonBase} border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`;
export const primaryClass = `${buttonBase} border-transparent bg-primary-900 text-white shadow-sm hover:bg-primary-700`;
export const dangerClass = `${buttonBase} border-red-200 bg-white text-red-700 hover:bg-red-50`;
export const checkboxClass = "mt-0.5 h-4 w-4 shrink-0 accent-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30";

/** Native modal supplies focus trapping, Escape handling and background inertness. */
export function VehicleDialog({ title, children, onClose, busy = false, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className={`fixed z-50 overflow-y-auto overscroll-contain border border-neutral-100 bg-white p-0 text-neutral-800 shadow-card backdrop:bg-neutral-900/30 ${wide ? "inset-0 m-auto h-[calc(100dvh_-_3rem)] max-h-[calc(100dvh_-_3rem)] w-[calc(100%_-_2rem)] max-w-5xl rounded-xl" : "inset-0 m-auto h-fit max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-2xl rounded-xl"}`}>
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-neutral-100 bg-white px-4 py-4 sm:px-5">
      <h2 className="font-headline text-lg font-semibold text-neutral-900">{title}</h2>
      <button type="button" onClick={onClose} disabled={busy} aria-label={`Close ${title}`} className="shrink-0 rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-4 w-4" /></button>
    </header>
    <div className="p-4 sm:p-5">{children}</div>
  </dialog>;
}
export function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: ReactNode }) {
  return <div className="relative"><label className="block space-y-1.5 text-sm text-neutral-700"><span className={`block text-xs font-medium ${tooltip ? "pr-6" : ""}`}>{label}</span>{children}</label>{tooltip && <FieldTooltip label={label} text={tooltip} />}</div>;
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error instanceof Error ? error.message : String(error)}</p> : null;
}
export function Paging({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
    <span>{total} record{total === 1 ? "" : "s"} · <span className="font-mono">Page {page} of {pages}</span></span>
    <div className="flex gap-1.5"><button type="button" className={buttonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
      <button type="button" className={buttonClass} disabled={page >= pages} onClick={() => onChange(page + 1)}>Next<ChevronRight className="h-3.5 w-3.5" /></button></div>
  </div>;
}
