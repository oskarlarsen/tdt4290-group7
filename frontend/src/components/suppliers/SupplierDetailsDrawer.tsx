import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { RiskBadge } from "../ui/RiskBadge";
import { StatusBadge } from "../ui/StatusBadge";
import { useSupplierNotes, useAddSupplierNote } from "../../hooks/useSupplierNotes";
import type { FollowUpStatus } from "../../hooks/useSupplierReviewStatus";
import type { TopRiskSupplier, RecentAlert } from "../../types/dashboard";

const ISSUE_CATEGORY_LABELS: Record<NonNullable<TopRiskSupplier["issueCategory"]>, string> = {
  VEHICLE_DEVIATION: "Vehicle deviation",
  CERTIFICATE_EXPIRY: "Certificate expiry",
  FUEL_DEVIATION: "Fuel/energy deviation",
};

const REVIEW_STATUS_BADGES: Record<FollowUpStatus, { label: string; color: "yellow" | "orange" | "tertiary" }> = {
  "to-review": { label: "To Review", color: "yellow" },
  "in-progress": { label: "In Progress", color: "orange" },
  resolved: { label: "Resolved", color: "tertiary" },
};

type Props = {
  supplier: TopRiskSupplier | null;
  alerts: RecentAlert[];
  reviewStatus: FollowUpStatus;
  onChangeReviewStatus: (status: FollowUpStatus) => void;
  onClose: () => void;
};

export function SupplierDetailsDrawer({
  supplier,
  alerts,
  reviewStatus,
  onChangeReviewStatus,
  onClose,
}: Props) {
  const isOpen = supplier !== null;
  const { data: notes = [] } = useSupplierNotes(supplier?.id ?? null);
  const addNote = useAddSupplierNote(supplier?.id ?? null);
  const [noteText, setNoteText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const linkedAlert = supplier ? alerts.find((a) => a.supplierId === supplier.id) : undefined;

  function handleSubmitNote() {
    if (!noteText.trim()) return;
    addNote.mutate(noteText.trim(), { onSuccess: () => setNoteText("") });
  }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-40 bg-neutral-900/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={supplier ? `${supplier.displayName} details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {supplier && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {supplier.displayName}
                </h2>
                <div className="mt-1.5">
                  <RiskBadge level={supplier.risk} />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title="Supplier information">
                <Field label="Org ID" value={supplier.orgId} />
                {supplier.email && <Field label="Email address" value={supplier.email} />}
                <Field label="Primary contract" value={supplier.primaryContract} />
              </Section>

              <Section title="Risk level & main issue">
                <p className="text-sm text-neutral-700">
                  {supplier.mainIssue || "No open issues on record."}
                </p>
              </Section>

              <Section title="Environmental compliance">
                <p className="text-sm text-neutral-700">
                  {supplier.issueCategory
                    ? ISSUE_CATEGORY_LABELS[supplier.issueCategory]
                    : "No compliance category recorded for this supplier."}
                </p>
              </Section>

              {/* Renamed from "Follow-up status" — this shows a linked
                  system alert, a different concept from the admin's own
                  manual review workflow below. Keeping the two visually
                  and semantically separate was the point of this fix. */}
              <Section title="Active alert">
                {linkedAlert ? (
                  <div className="rounded-lg bg-neutral-50 p-2.5">
                    <p className="text-sm font-medium text-neutral-900">{linkedAlert.title}</p>
                    <p className="mt-0.5 text-sm text-neutral-500">{linkedAlert.description}</p>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">
                    No active alerts currently linked to this supplier.
                  </p>
                )}
              </Section>

              <Section title="Review status">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={REVIEW_STATUS_BADGES[reviewStatus].color}
                    label={REVIEW_STATUS_BADGES[reviewStatus].label}
                  />
                  {reviewStatus === "in-progress" && (
                    <span className="text-xs text-neutral-500">Assigned to you</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-neutral-400">
                  Your own triage label — stored locally, does not affect risk classification.
                </p>
                <div className="mt-2 flex gap-2">
                  {reviewStatus === "to-review" && (
                    <button
                      onClick={() => onChangeReviewStatus("in-progress")}
                      className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Start Review
                    </button>
                  )}
                  {reviewStatus === "in-progress" && (
                    <button
                      onClick={() => onChangeReviewStatus("resolved")}
                      className="rounded-lg border border-tertiary-200 px-2.5 py-1.5 text-xs font-medium text-tertiary-700 hover:bg-tertiary-50"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </Section>

              <Section title="Admin notes">
                <div className="space-y-2">
                  {notes.length === 0 && (
                    <p className="text-sm text-neutral-400">No notes yet for this supplier.</p>
                  )}
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-neutral-50 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-700">{note.authorName}</span>
                        <span className="font-mono text-[11px] text-neutral-400">
                          {new Date(note.createdAt).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-700">{note.text}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add a note about this supplier's issue…"
                    rows={2}
                    className="flex-1 resize-none rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-700/20 focus:border-primary-700"
                  />
                  <button
                    onClick={handleSubmitNote}
                    disabled={!noteText.trim() || addNote.isPending}
                    aria-label="Add note"
                    className="rounded-lg bg-primary-900 px-2.5 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </Section>

              <Section title="Contracts, vehicles & certificates">
                <p className="text-sm text-neutral-400">
                  Detailed contract history, vehicle records, and certificate data aren't part of
                  the current mock dataset — this section will populate once the backend provides
                  per-supplier records.
                </p>
              </Section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}