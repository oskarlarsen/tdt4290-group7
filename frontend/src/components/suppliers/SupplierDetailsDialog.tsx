import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { VehicleDialog } from "../vehicles/VehicleDialog";
import { reviewSupplierOnboarding } from "../../api/onboarding";
import type { RecentAlert, TopRiskSupplier } from "../../types/dashboard";
import { SupplierReportingDataDialog } from "./SupplierReportingDataDialog";
import { describeLastActive, describeLastUpdated } from "../../utils/activity";

const ISSUE_CATEGORY_LABELS: Record<NonNullable<TopRiskSupplier["issueCategory"]>, string> = {
  VEHICLE_DEVIATION: "Kjøretøyavvik",
  CERTIFICATE_EXPIRY: "Sertifikatutløp",
  ENERGY_DEVIATION: "Energiavvik",
};

const ONBOARDING_STATUS_LABELS: Record<string, string> = { INVITED: "Invitert", PROFILE_PENDING: "Profil venter", DATA_DRAFT: "Pågår", VALIDATING: "Validerer", SUBMITTED: "Innsendt", UNDER_REVIEW: "Under vurdering", APPROVED: "Godkjent", REVISION_REQUIRED: "Endringer ønskes" };

const NOT_PROVIDED = "Ikke oppgitt ennå";

type Props = {
  supplier: TopRiskSupplier;
  /** The supplier's unresolved alerts, with their full text. */
  alerts: RecentAlert[];
  trackingSince?: string;
  onClose: () => void;
};

/** The long version of the supplier summary: full alert text, onboarding review and everything the supplier has submitted. */
export function SupplierDetailsDialog({ supplier, alerts, trackingSince, onClose }: Props) {
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
    ["Avtaler", supplier.agreementCount],
    ["Kjøretøy", supplier.vehicleCount],
    ["Sertifikater", supplier.certificateCount],
    ["Energirapporter", supplier.energyRecordCount],
    ["Produkter", supplier.productCount],
  ];

  return (
    <>
      <VehicleDialog title={`Detaljer for ${supplier.displayName}`} onClose={onClose} wide>
        <div className="space-y-6">
          <Section title="Leverandøropplysninger">
            <Field label="Org.nr." value={supplier.orgId} />
            {(supplier.contactEmail || supplier.email) && (
              <Field label="E-post til kontaktperson" value={supplier.contactEmail || supplier.email || ""} />
            )}
            {supplier.contactName && <Field label="Navn på kontaktperson" value={supplier.contactName} />}
            {supplier.contactPhone && <Field label="Telefon til kontaktperson" value={supplier.contactPhone} />}
            <Field label="Avtale" value={supplier.primaryContract} />
            <Field label="Aktivitet" value={describeLastActive(supplier.lastActiveAt, trackingSince)} />
            <Field label="Siste oppdatering" value={describeLastUpdated(supplier.lastUpdatedAt, supplier.lastUpdatedBy)} />
          </Section>

          <Section title="Hovedproblem">
            <p className="text-sm text-neutral-700">{supplier.mainIssue || "Ingen åpne saker registrert."}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {categories.length ? categories.map((category) => ISSUE_CATEGORY_LABELS[category]).join(", ") : "Ingen miljøkategori registrert."}
            </p>
          </Section>

          <Section title="Varsler">
            {alerts.length === 0 ? (
              <p className="text-sm text-neutral-500">Ingen uløste varsler for denne leverandøren.</p>
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

          <Section title="Registrering av leverandør">
            <Field label="Status" value={supplier.onboardingStatus === "INVITED" && !supplier.registeredAccountCount && !supplier.pendingInvitationCount ? "Ingen konto" : ONBOARDING_STATUS_LABELS[supplier.onboardingStatus ?? "INVITED"]} />
            <Field label="Registrerte kontoer" value={String(supplier.registeredAccountCount ?? 0)} />
            {supplier.submittedAt && <Field label="Innsendt" value={new Date(supplier.submittedAt).toLocaleString("nb-NO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowReportingData(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Vis innsendte rapporteringsdata
              </button>
            </div>
            {supplier.reviewerNotes && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Tilbakemelding fra vurdering: {supplier.reviewerNotes}</p>
            )}
            {(supplier.onboardingStatus === "SUBMITTED" || supplier.onboardingStatus === "UNDER_REVIEW") && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={onboardingNotes}
                  onChange={(event) => setOnboardingNotes(event.target.value)}
                  aria-label="Tilbakemelding til leverandøren"
                  placeholder="Tilbakemelding til leverandøren (påkrevd når du ber om endringer)"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-700/20 focus:border-primary-700"
                />
                {onboardingReview.isError && (
                  <p role="alert" className="text-sm text-red-700">
                    {onboardingReview.error instanceof Error ? onboardingReview.error.message : "Kunne ikke oppdatere vurderingen av registreringen."}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={onboardingReview.isPending || !onboardingNotes.trim()}
                    onClick={() => onboardingReview.mutate({ action: "REQUEST_CHANGES", notes: onboardingNotes.trim() })}
                    className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Be om endringer
                  </button>
                  <button
                    type="button"
                    disabled={onboardingReview.isPending}
                    onClick={() => onboardingReview.mutate({ action: "APPROVE", notes: onboardingNotes.trim() || undefined })}
                    className="rounded-lg bg-primary-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    Godkjenn registreringen
                  </button>
                </div>
              </div>
            )}
          </Section>

          <Section title="Avtaler, kjøretøy og sertifikater">
            <ul className="grid grid-cols-2 gap-2 text-sm text-neutral-700 sm:grid-cols-3">
              {counts.map(([label, value]) => (
                <li key={label} className="rounded-lg bg-neutral-50 p-2.5">
                  <span className="block text-xs text-neutral-500">{label}</span>
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
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}
