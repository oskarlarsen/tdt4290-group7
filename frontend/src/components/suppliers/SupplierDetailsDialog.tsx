import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { VehicleDialog } from "../vehicles/VehicleDialog";
import { reviewSupplierOnboarding } from "../../api/onboarding";
import type { RecentAlert, TopRiskSupplier } from "../../types/dashboard";
import { SupplierReportingDataDialog } from "./SupplierReportingDataDialog";

const ISSUE_CATEGORY_LABELS: Record<NonNullable<TopRiskSupplier["issueCategory"]>, string> = {
  VEHICLE_DEVIATION: "Vehicle deviation",
  CERTIFICATE_EXPIRY: "Certificate expiry",
  FUEL_DEVIATION: "Fuel/energy deviation",
};

const NOT_PROVIDED = "Not provided yet";

type Props = {
  supplier: TopRiskSupplier;
  /** The supplier's unresolved alerts, with their full text. */
  alerts: RecentAlert[];
  onClose: () => void;
};

/** The long version of the supplier summary: full alert text, onboarding review and everything the supplier has submitted. */
export function SupplierDetailsDialog({ supplier, alerts, onClose }: Props) {
  const [onboardingNotes, setOnboardingNotes] = useState("");
  const [showReportingData, setShowReportingData] = useState(false);
  const queryClient = useQueryClient();
  const onboardingReview = useMutation({
    mutationFn: ({ action, notes }: { action: "APPROVE" | "REQUEST_CHANGES"; notes?: string }) =>
      reviewSupplierOnboarding(supplier.id, action, notes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setOnboardingNotes("");
    },
  });
  const categories = supplier.issueCategories ?? (supplier.issueCategory ? [supplier.issueCategory] : []);
  const counts: [string, number | undefined][] = [
    ["Agreements", supplier.agreementCount],
    ["Vehicles", supplier.vehicleCount],
    ["Certificates", supplier.certificateCount],
    ["Energy records", supplier.energyRecordCount],
    ["Products", supplier.productCount],
  ];

  return (
    <>
      <VehicleDialog title={`Details for ${supplier.displayName}`} onClose={onClose} wide>
        <div className="space-y-6">
          <Section title="Supplier information">
            <Field label="Org ID" value={supplier.orgId} />
            {(supplier.contactEmail || supplier.email) && (
              <Field label="Contact email" value={supplier.contactEmail || supplier.email || ""} />
            )}
            {supplier.contactName && <Field label="Contact name" value={supplier.contactName} />}
            {supplier.contactPhone && <Field label="Contact phone" value={supplier.contactPhone} />}
            <Field label="Agreement" value={supplier.primaryContract} />
          </Section>

          <Section title="Main issue">
            <p className="text-sm text-neutral-700">{supplier.mainIssue || "No open issues on record."}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {categories.length ? categories.map((category) => ISSUE_CATEGORY_LABELS[category]).join(", ") : "No compliance category recorded."}
            </p>
          </Section>

          <Section title="Alerts">
            {alerts.length === 0 ? (
              <p className="text-sm text-neutral-400">No unresolved alerts for this supplier.</p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((alert) => (
                  <li key={alert.id} className="rounded-lg bg-neutral-50 p-2.5">
                    <p className="text-sm font-medium text-neutral-900">{alert.title}</p>
                    <p className="mt-0.5 text-sm text-neutral-500">{alert.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Supplier onboarding">
            <Field label="Status" value={(supplier.onboardingStatus ?? "INVITED").replace(/_/g, " ")} />
            <Field label="Registered accounts" value={String(supplier.registeredAccountCount ?? 0)} />
            {supplier.submittedAt && <Field label="Submitted" value={new Date(supplier.submittedAt).toLocaleString()} />}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowReportingData(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                View submitted reporting data
              </button>
            </div>
            {supplier.reviewerNotes && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Review feedback: {supplier.reviewerNotes}</p>
            )}
            {(supplier.onboardingStatus === "SUBMITTED" || supplier.onboardingStatus === "UNDER_REVIEW") && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={onboardingNotes}
                  onChange={(event) => setOnboardingNotes(event.target.value)}
                  placeholder="Feedback for the supplier (required when requesting changes)"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-700/20 focus:border-primary-700"
                />
                {onboardingReview.isError && (
                  <p role="alert" className="text-sm text-red-700">
                    {onboardingReview.error instanceof Error ? onboardingReview.error.message : "Could not update onboarding review."}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={onboardingReview.isPending || !onboardingNotes.trim()}
                    onClick={() => onboardingReview.mutate({ action: "REQUEST_CHANGES", notes: onboardingNotes.trim() })}
                    className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Request changes
                  </button>
                  <button
                    type="button"
                    disabled={onboardingReview.isPending}
                    onClick={() => onboardingReview.mutate({ action: "APPROVE", notes: onboardingNotes.trim() || undefined })}
                    className="rounded-lg bg-primary-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    Approve onboarding
                  </button>
                </div>
              </div>
            )}
          </Section>

          <Section title="Agreements, vehicles & certificates">
            <ul className="grid grid-cols-2 gap-2 text-sm text-neutral-700 sm:grid-cols-3">
              {counts.map(([label, value]) => (
                <li key={label} className="rounded-lg bg-neutral-50 p-2.5">
                  <span className="block text-xs text-neutral-400">{label}</span>
                  {value ? `${value} ${label.toLowerCase()}` : NOT_PROVIDED}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </VehicleDialog>

      {showReportingData && (
        <SupplierReportingDataDialog
          supplier={{ id: supplier.id, name: supplier.displayName }}
          onClose={() => setShowReportingData(false)}
        />
      )}
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
