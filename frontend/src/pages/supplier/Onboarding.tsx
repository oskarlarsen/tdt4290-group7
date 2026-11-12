import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  FileCheck2,
  Leaf,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  confirmCsv,
  getOnboardingStatus,
  getSupplierOverview,
  previewCsv,
  submitOnboarding,
  updateOnboardingProfile,
  type CsvEntity,
} from "@/api/onboarding";
import { ApiError } from "@/api/client";
import type {
  CsvPreview,
  OnboardingStatus,
  OnboardingStatusResponse,
  SupplierOverview,
} from "@/types/onboarding";
import { CopyableValue } from "@/components/ui/CopyableValue";
import { SupplierVehicleEntryForm } from "@/components/supplier/SupplierVehicleEntryForm";
import { SupplierEnergyEntryForm } from "@/components/supplier/SupplierEnergyEntryForm";
import { SupplierProductEntryForm } from "@/components/supplier/SupplierProductEntryForm";
import { FUEL_TECHNOLOGIES, vehicleWeightRange } from "@/utils/vehicleCatalog";
import { ECOLABEL_STANDARDS, PRODUCT_CATEGORIES, UNITS_OF_MEASURE } from "@/utils/productFormCsv";
import { formatNumber } from "@/utils/formatNumber";
import { agreementLabel } from "../../utils/agreementLabel";

// What the preview says about where a vehicle's fuel came from.
const REGISTRY_STATUS_LABELS: Record<string, string> = {
  FILLED: "Ja, fylt ut for deg",
  PROVIDED: "Nei, du skrev det inn",
  NOT_FOUND: "Skiltet ble ikke funnet",
  NOT_CHECKED: "Kunne ikke sjekkes",
};

const ENTITY_OPTIONS: Array<{ value: CsvEntity; label: string }> = [
  { value: "vehicles", label: "Kjøretøy" },
  { value: "energy", label: "Energi" },
  { value: "products", label: "Produkter" },
];

const ENTITY_API_VALUES: Record<CsvEntity, "VEHICLES" | "ENERGY" | "PRODUCTS"> = {
  vehicles: "VEHICLES",
  energy: "ENERGY",
  products: "PRODUCTS",
};

const VEHICLE_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Avtale",
  registration_number: "Registreringsnummer",
  is_planned: "Planlagt kjøretøy",
  fuel_technology: "Drivstoff eller framdrift",
  is_hybrid: "Hybridkjøretøy",
  full_contract_coverage: "Dekker hele avtaleperioden",
  start_year_week: "Dekning starter",
  end_year_week: "Dekning slutter",
  attachment_reference: "Referanse til dokumentasjon",
  notes: "Notater",
};

const ENERGY_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Avtale",
  facility_location_code: "Anleggs- eller lokasjonskode",
  facility_address: "Anleggsadresse",
  reporting_year: "Rapporteringsår",
  reporting_quarter: "Kvartal",
  goo_covered_kwh: "Dekket av opprinnelsesgarantier (GoO) (kWh)",
  electricity_kwh: "Strøm (kWh)",
  district_heating_kwh: "Fjernvarme (kWh)",
  biogas_kwh: "Biogass (kWh)",
  fossil_fuel_kwh: "Fossilt brensel (kWh)",
  self_produced_solar_kwh: "Egenprodusert sol (kWh)",
  self_produced_heatpump_kwh: "Egenprodusert varmepumpe (kWh)",
  storage_area_sqm: "Lagerareal (m²)",
  workshop_area_sqm: "Verkstedareal (m²)",
  other_area_sqm: "Annet areal (m²)",
  notes: "Notater",
};

const PRODUCT_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Avtale",
  product_code: "Produktkode eller SKU",
  product_name: "Produktnavn",
  product_category: "Produktkategori",
  ecolabel_standard: "Miljømerkestandard",
  license_number: "Lisensnummer",
  unit_of_measure: "Måleenhet",
  is_repaired_or_reused: "Reparert eller gjenbrukt produkt",
  notes: "Notater",
};

function friendlyFieldLabel(entity: CsvEntity, column: string): string {
  if (entity === "vehicles") return VEHICLE_FIELD_LABELS[column] ?? column;
  if (entity === "energy") return ENERGY_FIELD_LABELS[column] ?? column;
  if (entity === "products") return PRODUCT_FIELD_LABELS[column] ?? column;
  return column;
}

function friendlyErrorMessage(entity: CsvEntity, message: string): string {
  const labels =
    entity === "vehicles"
      ? VEHICLE_FIELD_LABELS
      : entity === "energy"
        ? ENERGY_FIELD_LABELS
        : PRODUCT_FIELD_LABELS;
  return Object.entries(labels).reduce(
    (result, [field, label]) => result.split(field).join(label),
    message,
  );
}

function friendlyBoolean(value: string | undefined): string {
  return value === "TRUE" || value === "1" ? "Ja" : value === "FALSE" || value === "0" ? "Nei" : "";
}

const STATUS_LABELS: Record<OnboardingStatus, string> = {
  INVITED: "Invitert",
  PROFILE_PENDING: "Profil venter",
  DATA_DRAFT: "Pågår",
  VALIDATING: "Validerer",
  SUBMITTED: "Innsendt",
  UNDER_REVIEW: "Under vurdering",
  APPROVED: "Godkjent",
  REVISION_REQUIRED: "Endringer ønskes",
};

const STATUS_STYLES: Record<OnboardingStatus, string> = {
  INVITED: "bg-slate-100 text-slate-700",
  PROFILE_PENDING: "bg-amber-100 text-amber-800",
  DATA_DRAFT: "bg-blue-100 text-blue-800",
  VALIDATING: "bg-blue-100 text-blue-800",
  SUBMITTED: "bg-indigo-100 text-indigo-800",
  UNDER_REVIEW: "bg-indigo-100 text-indigo-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REVISION_REQUIRED: "bg-orange-100 text-orange-800",
};

function messageFrom(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Noe gikk galt. Prøv igjen.";
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: number;
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

export default function Onboarding() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null);
  const [overview, setOverview] = useState<SupplierOverview | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // ?entity=energy (from the Energy page) opens the energy form directly.
  const [searchParams] = useSearchParams();
  const requestedEntity = searchParams.get("entity");
  const [entity, setEntity] = useState<CsvEntity>(requestedEntity === "energy" || requestedEntity === "products" ? requestedEntity : "vehicles");
  // Each kind of data can be entered in a form or as a CSV file; each way keeps its own preview.
  const [method, setMethod] = useState<"form" | "csv">("form");
  const [previews, setPreviews] = useState<Record<"form" | "csv", CsvPreview | null>>({ form: null, csv: null });
  const preview = previews[method];
  const setPreview = (value: CsvPreview | null) => setPreviews((current) => ({ ...current, [method]: value }));
  const [formVersion, setFormVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The banners render at the top of a long page; bring them into view after an action near the bottom.
  useEffect(() => {
    if (notice || error) document.querySelector('[data-onboarding-banner]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [notice, error]);

  const refresh = useCallback(async () => {
    const [nextStatus, nextOverview] = await Promise.all([
      getOnboardingStatus(),
      getSupplierOverview(),
    ]);
    setStatus(nextStatus);
    setOverview(nextOverview);
    setEntity((current) => nextStatus.requiredEntities.includes(ENTITY_API_VALUES[current])
      ? current
      : (ENTITY_OPTIONS.find((option) => nextStatus.requiredEntities.includes(ENTITY_API_VALUES[option.value]))?.value ?? "vehicles"));
    setContactName(nextStatus.contactName ?? "");
    setContactEmail(nextStatus.contactEmail ?? "");
    setContactPhone(nextStatus.contactPhone ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getOnboardingStatus(), getSupplierOverview()])
      .then(([nextStatus, nextOverview]) => {
        if (!active) return;
        setStatus(nextStatus);
        setOverview(nextOverview);
        setEntity((current) => nextStatus.requiredEntities.includes(ENTITY_API_VALUES[current])
          ? current
          : (ENTITY_OPTIONS.find((option) => nextStatus.requiredEntities.includes(ENTITY_API_VALUES[option.value]))?.value ?? "vehicles"));
        setContactName(nextStatus.contactName ?? "");
        setContactEmail(nextStatus.contactEmail ?? "");
        setContactPhone(nextStatus.contactPhone ?? "");
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFrom(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function perform(action: () => Promise<void>, successMessage?: string) {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setWorking(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      await updateOnboardingProfile({ contactName, contactEmail, contactPhone });
      await refresh();
    }, "Kontaktopplysningene er lagret.");
  }

  async function handlePreview(formFile: File) {
    await perform(async () => {
      const result = await previewCsv(entity, formFile);
      setPreview(result);
      setNotice(result.canCommit ? "Validering bestått. Se gjennom oppføringene før import." : null);
    });
  }

  function handleFormChange() {
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  async function handleConfirm() {
    if (!preview?.canCommit) return;
    await perform(async () => {
      const result = await confirmCsv(entity, preview.batchId);
      setPreview(null);
      setFormVersion((current) => current + 1);
      await refresh();
      setNotice(result.message);
    });
  }

  async function handleSubmit() {
    await perform(async () => {
      const result = await submitOnboarding();
      setStatus(result);
      await refresh();
      navigate("/supplier/dashboard", { replace: true, state: { notice: "Registreringen din er sendt inn til vurdering." } });
    });
  }

  const completedSteps = status?.steps.filter((step) => step.isCompleted).length ?? 0;
  const stepCount = status?.steps.length ?? 0;
  const locked = status?.status === "SUBMITTED" ||
    status?.status === "UNDER_REVIEW" ||
    status?.status === "APPROVED";

  // Energy is reported every quarter, so its form stays open after the onboarding has been submitted.
  const energyStaysOpen = locked && !!status?.requiredEntities.includes("ENERGY");
  useEffect(() => {
    if (energyStaysOpen && entity !== "energy") setEntity("energy");
  }, [energyStaysOpen, entity]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-neutral-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        Laster leverandørarbeidsområde…
      </div>
    );
  }

  if (!status || !overview) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6">
        <div className="flex gap-3 text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="font-semibold">Registrering av leverandør er utilgjengelig</h1>
            <p className="mt-1 text-sm">{error}</p>
            <p className="mt-2 text-sm text-neutral-600">
              Leverandørkontoen må kobles til en organisasjon i systemet før dette arbeidsområdet kan lastes.
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                refresh().catch((cause: unknown) => setError(messageFrom(cause))).finally(() => setLoading(false));
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Prøv igjen
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl bg-primary-900 px-6 py-7 text-white sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-primary-100">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
              Leverandørportal
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{overview.supplierName}</h1>
            <p className="mt-1 text-sm text-primary-100">
              Organisasjonsnummer {overview.orgNumber} · sjekkliste for registrering og rapportering
            </p>
          </div>
          <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${STATUS_STYLES[status.status]}`}>
            {STATUS_LABELS[status.status]}
          </span>
        </div>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-primary-100">Fremdrift i registreringen</p>
            <p className="mt-1 text-lg font-semibold">{completedSteps} av {stepCount} trinn fullført</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20 sm:w-64">
            <div
              className="h-full rounded-full bg-emerald-300 transition-[width]"
              style={{ width: `${stepCount ? (completedSteps / stepCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </section>

      {error && (
        <div data-onboarding-banner role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div data-onboarding-banner role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      )}

      {status.reviewerNotes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Tilbakemelding fra saksbehandler: </span>{status.reviewerNotes}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Building2} label="Avtaler" value={overview.agreements.length} />
        <Metric icon={Truck} label="Kjøretøy" value={overview.totalVehicles} />
        <Metric icon={ShieldCheck} label="Sertifikater" value={overview.totalCertificates} />
        <Metric icon={Zap} label="Energirapporter" value={overview.totalEnergyRecords} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Sjekkliste for registrering</h2>
              <p className="mt-1 text-sm text-neutral-500">Opplysningene dine lagres på leverandørkontoen din.</p>
            </div>
            <FileCheck2 className="h-5 w-5 text-primary-700" aria-hidden="true" />
          </div>
          <ol className="space-y-4">
            {status.steps.map((step) => (
              <li key={step.stepKey} className="flex gap-3">
                {step.isCompleted
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-neutral-300" aria-hidden="true" />}
                <div>
                  <p className="text-sm font-medium text-neutral-800">{step.title}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <h3 className="mb-1 text-sm font-semibold text-neutral-800">Avtaler</h3>
            <p className="mb-3 text-xs text-neutral-500">
              Administratoren velger hvilken informasjon som kreves for hver avtale.
            </p>
            {overview.agreements.length === 0 ? (
              <p className="text-sm text-neutral-500">Ingen avtaler er knyttet til denne leverandørkontoen ennå.</p>
            ) : (
              <ul className="space-y-2">
                {overview.agreements.map((agreement) => (
                  <li key={agreement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-800">{agreementLabel(agreement)}</span>
                      <CopyableValue label="Avtale-ID" value={agreement.id} />
                    </span>
                    <span className="text-right text-neutral-500">
                      {[
                        agreement.requiresVehicles && "Kjøretøy",
                        agreement.requiresEnergy && "Energi",
                        agreement.requiresProducts && "Produkter",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold text-neutral-900">Kontaktperson for bærekraft</h2>
          <p className="mt-1 text-sm text-neutral-500">Hvem skal kommunen kontakte om miljørapportering?</p>
          <form onSubmit={saveProfile} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-neutral-700">
              Navn på kontaktperson
              <input
                required
                minLength={2}
                maxLength={100}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                disabled={working || locked}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 font-normal outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50"
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              E-post
              <input
                required
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                disabled={working || locked}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 font-normal outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50"
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700">
              Telefon <span className="font-normal text-neutral-500">(valgfritt)</span>
              <input
                type="tel"
                pattern="\+?[0-9 \(\)\-]{4,20}"
                title="Skriv inn et telefonnummer, for eksempel +47 123 45 678"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                disabled={working || locked}
                className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 font-normal outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100 disabled:bg-neutral-50"
              />
            </label>
            <button
              type="submit"
              disabled={working || locked}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Lagre kontaktperson
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Skriv inn rapporteringsdata</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Fyll ut de nødvendige opplysningene i skjemaet. Systemet validerer og behandler innsendingen automatisk.
            </p>
            {entity === "vehicles" && (
              <p className="mt-1 text-sm text-neutral-500">
                Only add vehicles you have actually used. Your approved list is already registered; vehicles that are not on it are checked with Statens vegvesen.
              </p>
            )}
          </div>
          <Boxes className="hidden h-5 w-5 text-primary-700 sm:block" aria-hidden="true" />
        </div>

        {locked && !energyStaysOpen ? (
          <p className="mt-5 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            Rapporteringsendringer er ikke tilgjengelige mens denne innsendingen er {STATUS_LABELS[status.status].toLowerCase()}.
          </p>
        ) : status.requiredEntities.length === 0 ? (
          <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Administratoren din har ikke tildelt noen informasjon som skal samles inn ennå.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {energyStaysOpen && (
              <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                Registreringen din er {STATUS_LABELS[status.status].toLowerCase()}. Kjøretøy og produkter er låst, men du kan fortsette å rapportere energi hvert kvartal.
              </p>
            )}
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-neutral-700">
                Informasjonstype
                <select
                  value={entity}
                  onChange={(event) => {
                    setEntity(event.target.value as CsvEntity);
                    setPreviews({ form: null, csv: null });
                    setError(null);
                    setNotice(null);
                  }}
                  disabled={working}
                  className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                >
                  {ENTITY_OPTIONS.filter((option) =>
                    status.requiredEntities.includes(ENTITY_API_VALUES[option.value]) && (!energyStaysOpen || option.value === "energy"),
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div role="tablist" aria-label="Slik skriver du inn dataene" className="inline-flex rounded-lg border border-neutral-200 p-0.5 text-sm">
              {([["form", "Fyll ut skjema"], ["csv", "Last opp CSV-fil"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={method === value}
                  disabled={working}
                  onClick={() => { setMethod(value); setError(null); setNotice(null); }}
                  className={`rounded-md px-3 py-1.5 font-medium ${method === value ? "bg-primary-900 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {entity === "vehicles" && (
              <SupplierVehicleEntryForm
                mode={method}
                key={`vehicles-${formVersion}`}
                agreements={overview.agreements.filter((agreement) => agreement.requiresVehicles)}
                working={working}
                onPreview={handlePreview}
                onChange={handleFormChange}
                unchecked={(previews.form?.previewRows ?? []).filter((row) => row.registry_status === "NOT_CHECKED").map((row) => row.registration_number)}
              />
            )}

            {entity === "energy" && (
              <SupplierEnergyEntryForm
                mode={method}
                key={`energy-${formVersion}`}
                agreements={overview.agreements.filter((agreement) => agreement.requiresEnergy)}
                working={working}
                onPreview={handlePreview}
                onChange={handleFormChange}
              />
            )}

            {entity === "products" && (
              <SupplierProductEntryForm
                mode={method}
                key={`products-${formVersion}`}
                agreements={overview.agreements.filter((agreement) => agreement.requiresProducts)}
                working={working}
                onPreview={handlePreview}
                onChange={handleFormChange}
              />
            )}
          </div>
        )}

        {preview && (
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-neutral-900">
                  {entity === "vehicles"
                    ? "Kjøretøyopplysninger"
                    : entity === "energy"
                      ? "Opplysninger om energianlegg"
                      : "Produktopplysninger"}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {preview.validRows} klare · {preview.errorRows} med feil · {preview.totalRows} totalt
                </p>
              </div>
              {preview.canCommit ? (
                <button
                  type="button"
                  disabled={working}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Bekreft import
                </button>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">Rett feil for å importere</span>
              )}
            </div>

            {preview.warnings?.map((warning) => <p key={warning} role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>)}
            {preview.notices && preview.notices.length > 0 && (
              <ul role="status" className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {preview.notices.map((notice) => (
                  <li key={notice}>{notice}</li>
                ))}
              </ul>
            )}

            {preview.errors.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-red-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-red-50 text-red-900">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Rad</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Felt</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Problem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {preview.errors.slice(0, 30).map((item, index) => (
                      <tr key={`${item.row}-${item.column}-${index}`}>
                        <td className="px-3 py-2">{item.row}</td>
                        <td className="px-3 py-2 text-xs font-medium text-neutral-700">
                          {friendlyFieldLabel(entity, item.column)}
                        </td>
                        <td className="px-3 py-2">
                          {friendlyErrorMessage(entity, item.message)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.errors.length > 30 && (
                  <p className="bg-red-50 px-3 py-2 text-xs text-red-800">
                    Viser 30 av {preview.errors.length} valideringsfeil.
                  </p>
                )}
              </div>
            )}

            {preview.previewRows.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200">
                {entity === "vehicles" ? (
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        {["Avtale", "Kjøretøy", "Drivstoff / framdrift", "Hybrid", "Vekt", "Sjekket mot Statens vegvesen", "Dekning"].map((label) => (
                          <th scope="col" key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {preview.previewRows.map((row, index) => {
                        const agreement = overview.agreements.find((item) => item.id === row.agreement_id);
                        const fuel = Object.entries(FUEL_TECHNOLOGIES)
                          .find(([code]) => code === row.fuel_technology)?.[1] ?? "—";
                        const coverage = friendlyBoolean(row.full_contract_coverage) === "Ja"
                          ? "Hele avtaleperioden"
                          : row.start_year_week && row.end_year_week ? `${row.start_year_week} til ${row.end_year_week}` : "—";
                        return (
                          <tr key={index}>
                            <td className="px-3 py-2">{agreement ? agreementLabel(agreement) : row.agreement_id}</td>
                            <td className="px-3 py-2">{row.registration_number || "Planlagt kjøretøy"}</td>
                            <td className="px-3 py-2">{fuel}</td>
                            <td className="px-3 py-2">{friendlyBoolean(row.is_hybrid)}</td>
                            <td className="px-3 py-2">{vehicleWeightRange(row.vehicle_category) ?? "—"}</td>
                            <td className="px-3 py-2">{REGISTRY_STATUS_LABELS[row.registry_status] ?? "—"}</td>
                            <td className="px-3 py-2">{coverage}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : entity === "energy" ? (
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        {["Avtale", "Anlegg", "Periode", "Strøm", "Fjernvarme", "Sol", "Varmepumpe", "Opprinnelsesgarantier"].map((label) => (
                          <th scope="col" key={label} className="px-3 py-2 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {preview.previewRows.map((row, index) => {
                        const agreement = overview.agreements.find((item) => item.id === row.agreement_id);
                        const kwh = (value: string | undefined) => (value ? `${formatNumber(Number(value))} kWh` : "—");
                        return (
                          <tr key={index}>
                            <td className="px-3 py-2">{agreement ? agreementLabel(agreement) : row.agreement_id}</td>
                            <td className="px-3 py-2">
                              <div className="font-mono font-medium">{row.facility_location_code}</div>
                              <div className="text-neutral-500">{row.facility_address}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">{row.reporting_year} Q{row.reporting_quarter}</td>
                            <td className="whitespace-nowrap px-3 py-2">{kwh(row.electricity_kwh)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{kwh(row.district_heating_kwh)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{kwh(row.self_produced_solar_kwh)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{kwh(row.self_produced_heatpump_kwh)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{kwh(row.goo_covered_kwh)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        {["Avtale", "Produktkode", "Produktnavn", "Kategori", "Miljømerke", "Enhet", "Reparert/gjenbrukt"].map((label) => (
                          <th scope="col" key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {preview.previewRows.map((row, index) => {
                        const agreement = overview.agreements.find((item) => item.id === row.agreement_id);
                        const category = PRODUCT_CATEGORIES[row.product_category] ?? row.product_category;
                        const ecolabel = row.ecolabel_standard === "NONE"
                          ? "Ingen"
                          : `${ECOLABEL_STANDARDS[row.ecolabel_standard] ?? row.ecolabel_standard}${row.license_number ? ` (#${row.license_number})` : ""}`;
                        const unit = UNITS_OF_MEASURE[row.unit_of_measure] ?? row.unit_of_measure;
                        return (
                          <tr key={index}>
                            <td className="px-3 py-2">{agreement ? agreementLabel(agreement) : row.agreement_id}</td>
                            <td className="px-3 py-2 font-mono font-medium">{row.product_code}</td>
                            <td className="px-3 py-2">{row.product_name}</td>
                            <td className="px-3 py-2">{category}</td>
                            <td className="px-3 py-2">{ecolabel}</td>
                            <td className="px-3 py-2">{unit}</td>
                            <td className="px-3 py-2">{friendlyBoolean(row.is_repaired_or_reused)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-semibold text-neutral-900">Klar til å sende inn?</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Nødvendig informasjon kontrolleres av serveren før den sendes til kommunal vurdering.
          </p>
          {!status.canSubmit && status.requiredEntities.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">Be administratoren din tildele informasjonen som kreves under avtalen.</p>
          )}
        </div>
        <button
          type="button"
          disabled={working || !status.canSubmit}
          onClick={handleSubmit}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send inn registreringen
        </button>
      </section>
    </div>
  );
}
