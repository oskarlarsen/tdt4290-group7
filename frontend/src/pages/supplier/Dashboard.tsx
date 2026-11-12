import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { BadgeCheck, Bell, Building2, CheckCircle2, ClipboardList, LoaderCircle, Package, Truck, Zap } from "lucide-react";
import { getOnboardingStatus, getSupplierOverview } from "@/api/onboarding";
import type { OnboardingStatusResponse, SupplierOverview } from "@/types/onboarding";
import { agreementLabel } from "../../utils/agreementLabel";
import { formatDate } from "../../utils/formatDate";
import { useSupplierAlerts } from "../../hooks/useSupplierAlerts";
import { ALERT_CATEGORIES } from "../../types/dashboard";
import type { AlertCategory } from "../../types/dashboard";

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  ENVIRONMENTAL_COMPLIANCE: "Miljøoppfølging",
  ENERGY_FUEL: "Energi",
  VEHICLE_COMPLIANCE: "Kjøretøyoppfølging",
  CERTIFICATES: "Sertifikater",
};

const DASHBOARD_STATUSES = new Set(["SUBMITTED", "UNDER_REVIEW", "APPROVED"]);

const STATUS_LABELS: Record<OnboardingStatusResponse["status"], string> = {
  INVITED: "Invitert",
  PROFILE_PENDING: "Profil venter",
  DATA_DRAFT: "Pågår",
  VALIDATING: "Validerer",
  SUBMITTED: "Innsendt",
  UNDER_REVIEW: "Under vurdering",
  APPROVED: "Godkjent",
  REVISION_REQUIRED: "Endringer ønskes",
};

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-primary-700" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  // Set by the onboarding page when it sends the supplier here after submitting.
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null);
  const [overview, setOverview] = useState<SupplierOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alerts = useSupplierAlerts();
  const openAlerts = (alerts.data ?? []).filter((alert) => alert.status === "OPEN");

  useEffect(() => {
    let active = true;
    Promise.all([getOnboardingStatus(), getSupplierOverview()])
      .then(([nextStatus, nextOverview]) => {
        if (!active) return;
        setStatus(nextStatus);
        setOverview(nextOverview);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Kunne ikke laste leverandørdashbordet.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div role="status" className="flex min-h-64 items-center justify-center text-neutral-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">Laster leverandørdashbord…</span>
      </div>
    );
  }

  if (status && !DASHBOARD_STATUSES.has(status.status)) {
    return <Navigate to="/supplier/onboarding" replace />;
  }

  if (error || !status || !overview) {
    return (
      <section role="alert" className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6 text-sm text-red-800">
        {error ?? "Kunne ikke laste leverandørdashbordet. Prøv igjen."}
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      )}
      <section className="rounded-2xl bg-primary-900 px-6 py-7 text-white sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-primary-100">Leverandørportal</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{overview.supplierName}</h1>
            <p className="mt-1 text-sm text-primary-100">Organisasjonsnummer {overview.orgNumber}</p>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
            {STATUS_LABELS[status.status]}
          </span>
        </div>
        {status.reviewerNotes && (
          <p className="mt-5 rounded-lg bg-white/10 px-4 py-3 text-sm">
            <span className="font-semibold">Tilbakemelding fra saksbehandler: </span>{status.reviewerNotes}
          </p>
        )}
      </section>

      <section aria-label="Leverandøroversikt" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric icon={Building2} label="Avtaler" value={overview.agreements.length} />
        <Metric icon={Truck} label="Kjøretøy" value={overview.totalVehicles} />
        <Metric icon={BadgeCheck} label="Sertifikater" value={overview.totalCertificates} />
        <Metric icon={Zap} label="Energirapporter" value={overview.totalEnergyRecords} />
        <Metric icon={Package} label="Produkter" value={overview.totalProducts} />
      </section>

      <section aria-label="Åpne saker" className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-neutral-900">Åpne saker</h2>
        </div>
        {alerts.isError ? (
          <p className="text-sm text-neutral-500">Kunne ikke laste sakene dine. Åpne Mine varsler for å prøve igjen.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ALERT_CATEGORIES.map((category) => {
              const count = openAlerts.filter((alert) => alert.category === category).length;
              return (
                <li key={category}>
                  <Link
                    to={`/supplier/alerts?category=${category}`}
                    className="block rounded-lg border border-neutral-100 p-3 hover:bg-neutral-50"
                  >
                    <span className="block text-sm text-neutral-600">{CATEGORY_LABELS[category]}</span>
                    <span className="mt-1 block text-2xl font-semibold text-neutral-900">{alerts.isLoading ? "…" : count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary-700" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Mine avtaler</h2>
            <p className="text-sm text-neutral-500">Avtaler og rapporteringsdata knyttet til organisasjonen din.</p>
          </div>
        </div>
        {overview.agreements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 p-5 text-center text-sm text-neutral-500">
            Ingen avtaler er lagt til organisasjonen din ennå. Kontakt kommuneadministratoren hvis du forventer å se en her.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {overview.agreements.map((agreement) => (
              <li key={agreement.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div>
                  <p className="font-medium text-neutral-900">{agreementLabel(agreement)}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {formatDate(agreement.startDate)} – {formatDate(agreement.endDate)}
                  </p>
                </div>
                <div className="text-right text-sm text-neutral-600">
                  <p>{agreement.active ? "Aktiv" : "Inaktiv"}</p>
                  <p className="text-xs text-neutral-500">
                    {agreement.activeVehiclesCount} / {agreement.allowedVehicles} kjøretøy
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
