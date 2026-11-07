import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  riskIndicator?: string;
  contractName: string;
  supplierName: string;
  reason: string;
  message: string;
  onMessageChange?: (message: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  showDemoNote?: boolean;
  wrapReason?: boolean;
};

export function NoticeReviewDialog({
  riskIndicator,
  contractName,
  supplierName,
  reason,
  message,
  onMessageChange,
  onCancel,
  onConfirm,
  showDemoNote = true,
  wrapReason = false,
}: Props) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-notice-title"
        className="w-full max-w-md rounded-xl border border-neutral-100 bg-white p-4 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className={wrapReason ? "min-w-0 flex-1" : ""}>
            <h2 id="send-notice-title" className="font-headline text-lg font-semibold text-neutral-900">
              Review notice
            </h2>
            <dl
              className={`mt-3 text-sm ${
                wrapReason
                  ? "grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2"
                  : "space-y-2"
              }`}
            >
              {riskIndicator && (
                <div className={wrapReason ? "contents" : "flex justify-between gap-4"}>
                  <dt className="text-neutral-500">Risk / Risk Indicator</dt>
                  <dd
                    className={
                      wrapReason
                        ? "min-w-0 flex-1 break-words text-left font-medium leading-5 text-neutral-900"
                        : "text-right font-medium text-neutral-900"
                    }
                  >
                    {riskIndicator}
                  </dd>
                </div>
              )}
              <div className={wrapReason ? "contents" : "flex justify-between gap-4"}>
                <dt className="text-neutral-500">Contract</dt>
                <dd
                  className={
                    wrapReason
                      ? "min-w-0 flex-1 break-words text-left font-medium leading-5 text-neutral-900"
                      : "text-right font-medium text-neutral-900"
                  }
                >
                  {contractName}
                </dd>
              </div>
              <div className={wrapReason ? "contents" : "flex justify-between gap-4"}>
                <dt className="text-neutral-500">Supplier</dt>
                <dd
                  className={
                    wrapReason
                      ? "min-w-0 flex-1 break-words text-left font-medium leading-5 text-neutral-900"
                      : "text-right font-medium text-neutral-900"
                  }
                >
                  {supplierName}
                </dd>
              </div>
              <div className={wrapReason ? "contents" : "flex justify-between gap-4"}>
                <dt className="text-neutral-500">Reason</dt>
                <dd
                  className={
                    wrapReason
                      ? "min-w-0 flex-1 break-words whitespace-pre-line text-left font-medium leading-5 text-neutral-900"
                      : "text-right font-medium text-neutral-900"
                  }
                >
                  {reason}
                </dd>
              </div>
            </dl>
            <div className="mt-3 rounded-lg bg-neutral-50 p-3">
              <label htmlFor="notice-message" className="text-xs font-medium text-neutral-500">
                Notice message
              </label>
              <textarea
                id="notice-message"
                value={message}
                onChange={(event) => onMessageChange?.(event.target.value)}
                readOnly={!onMessageChange}
                rows={4}
                className="mt-1 w-full resize-y rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm leading-5 text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10 read-only:cursor-default"
              />
            </div>
            {showDemoNote && (
              <p className="mt-3 text-xs leading-5 text-neutral-500">
                Demo only — no email will be sent.
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            Send notice
          </button>
        </div>
      </div>
    </div>
  );
}
