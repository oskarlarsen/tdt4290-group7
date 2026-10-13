import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export const inputClass = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10 disabled:bg-neutral-100";
export const buttonClass = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
export const primaryClass = `${buttonClass} border-primary-900 bg-primary-900 text-white hover:bg-primary-800`;

/** Native modal supplies focus trapping, Escape handling and background inertness. */
export function VehicleDialog({ title, children, onClose, busy = false, drawer = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className={`z-50 w-full overflow-y-auto bg-white p-0 text-neutral-800 shadow-xl backdrop:bg-neutral-900/40 ${drawer ? "fixed inset-y-0 left-auto right-0 m-0 h-screen max-h-screen max-w-3xl" : "max-h-[90vh] max-w-2xl rounded-2xl"}`}>
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
      <h2 className="font-headline text-xl font-semibold">{title}</h2>
      <button type="button" onClick={onClose} disabled={busy} aria-label={`Close ${title}`} className={buttonClass}><X className="h-4 w-4" /></button>
    </header>
    <div className="p-6">{children}</div>
  </dialog>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm font-medium text-neutral-700"><span>{label}</span>{children}</label>;
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error instanceof Error ? error.message : String(error)}</p> : null;
}
export function Paging({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex items-center justify-between gap-3 pt-4 text-sm text-neutral-600">
    <span>{total} record{total === 1 ? "" : "s"} · Page {page} of {pages}</span>
    <div className="flex gap-2"><button className={buttonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <button className={buttonClass} disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button></div>
  </div>;
}
