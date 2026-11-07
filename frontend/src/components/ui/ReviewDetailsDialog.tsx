import { X, FileText, Clock, Building, MessageCircle } from "lucide-react";
import type { PendingReview } from "../../mocks/db";

type Props = {
  review: PendingReview;
  onClose: () => void;
};

export function ReviewDetailsDialog({ review, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-details-title"
        className="w-full max-w-lg rounded-xl border border-neutral-100 bg-white shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 id="review-details-title" className="font-headline text-lg font-semibold text-neutral-900">
            Submission Details
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Header Info */}
          <div>
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-lg bg-blue-50 p-2 text-blue-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-neutral-900">{review.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-neutral-400" />
                    Submitted {review.submittedAt}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Building className="h-4 w-4 text-neutral-400" />
                    {review.contractName || "No specific contract"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Current Status</span>
              <div className="mt-2 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500"></span>
                </span>
                <span className="text-sm font-semibold text-neutral-900">{review.status || "Under Administrative Review"}</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Submission Type</span>
              <p className="mt-2 text-sm font-medium text-neutral-900">{review.type}</p>
            </div>
          </div>

          {/* Document / Data Details */}
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-2">Document Details</h4>
            <div className="rounded-lg border border-neutral-200 p-3 text-sm text-neutral-700 bg-white">
              {review.documentDetails || "No additional document metadata provided."}
            </div>
          </div>

          {/* Municipal Feedback */}
          {review.feedback && (
            <div>
              <h4 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-neutral-500" />
                Municipal Review Feedback
              </h4>
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 text-sm text-amber-900">
                {review.feedback}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4 sm:flex sm:flex-row-reverse rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50 sm:w-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
