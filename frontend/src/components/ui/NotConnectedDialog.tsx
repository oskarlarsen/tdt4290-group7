import { useEffect, useId } from "react";
import { X } from "lucide-react";

export function NotConnectedDialog({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-neutral-100 bg-white p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-headline text-lg font-semibold text-neutral-900">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-5 text-neutral-600">{message}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Lukk"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}