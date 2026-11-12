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
import { useNavigate } from "react-router-dom";
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
  FILLED: "Yes, filled in for you",
  PROVIDED: "No, you entered it",
  NOT_FOUND: "Plate not found",
  NOT_CHECKED: "Could not be checked",
};

const ENTITY_OPTIONS: Array<{ value: CsvEntity; label: string }> = [
  { value: "vehicles", label: "Vehicles" },
  { value: "energy", label: "Energy" },
  { value: "products", label: "Products" },
];

const ENTITY_API_VALUES: Record<CsvEntity, "VEHICLES" | "ENERGY" | "PRODUCTS"> = {
  vehicles: "VEHICLES",
  energy: "ENERGY",
  products: "PRODUCTS",
};

const VEHICLE_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Agreement",
  registration_number: "Vehicle registration plate",
  is_planned: "Planned vehicle",
  fuel_technology: "Fuel or propulsion",
  is_hybrid: "Hybrid vehicle",
  full_contract_coverage: "Full agreement-period coverage",
  start_year_week: "Coverage starts",
  end_year_week: "Coverage ends",
  attachment_reference: "Supporting document reference",
  notes: "Notes",
};

const ENERGY_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Agreement",
  facility_location_code: "Facility or location code",
  facility_address: "Facility address",
  reporting_year: "Reporting year",
  electricity_kwh: "Electricity (kWh)",
  district_heating_kwh: "District heating (kWh)",
  biogas_kwh: "Biogas (kWh)",
  fossil_fuel_kwh: "Fossil fuel (kWh)",
  self_produced_solar_kwh: "Self-produced solar (kWh)",
  self_produced_heatpump_kwh: "Self-produced heat pump (kWh)",
  storage_area_sqm: "Storage area (m²)",
  workshop_area_sqm: "Workshop area (m²)",
  other_area_sqm: "Other area (m²)",
  notes: "Notes",
};

const PRODUCT_FIELD_LABELS: Record<string, string> = {
  agreement_id: "Agreement",
  product_code: "Product code or SKU",
  product_name: "Product name",
  product_category: "Product category",
  ecolabel_standard: "Ecolabel standard",
  license_number: "License number",
  unit_of_measure: "Unit of measure",
  is_repaired_or_reused: "Repaired or reused product",
  notes: "Notes",
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
  return value === "TRUE" || value === "1" ? "Yes" : value === "FALSE" || value === "0" ? "No" : "";
}

const STATUS_LABELS: Record<OnboardingStatus, string> = {
  INVITED: "Invited",
  PROFILE_PENDING: "Profile pending",
  DATA_DRAFT: "In progress",
  VALIDATING: "Validating",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REVISION_REQUIRED: "Changes requested",
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
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
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
  const [entity, setEntity] = useState<CsvEntity>("vehicles");
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
    }, "Contact details saved.");
  }

  async function handlePreview(formFile: File) {
    await perform(async () => {
      const result = await previewCsv(entity, formFile);
      setPreview(result);
      setNotice(result.canCommit ? "Validation passed. Review the entries before importing." : null);
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
      navigate("/supplier/dashboard", { replace: true, state: { notice: "Your onboarding information has been submitted for review." } });
    });
  }

  const completedSteps = status?.steps.filter((step) => step.isCompleted).length ?? 0;
  const stepCount = status?.steps.length ?? 0;
  const locked = status?.status === "SUBMITTED" ||
    status?.status === "UNDER_REVIEW" ||
    status?.status === "APPROVED";

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-neutral-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        Loading supplier workspace…
      </div>
    );
  }

  if (!status || !overview) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-6">
        <div className="flex gap-3 text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h1 className="font-semibold">Supplier onboarding is unavailable</h1>
            <p className="mt-1 text-sm">{error}</p>
            <p className="mt-2 text-sm text-neutral-600">
              The supplier account must be linked to an organization in the backend before this workspace can load.
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
              Try again
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
              Supplier portal
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">{overview.supplierName}</h1>
            <p className="mt-1 text-sm text-primary-100">
              Organization number {overview.orgNumber} · onboarding checklist and reporting
            </p>
          </div>
          <span className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-medium ${STATUS_STYLES[status.status]}`}>
            {STATUS_LABELS[status.status]}
          </span>
        </div>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-primary-100">Onboarding progress</p>
            <p className="mt-1 text-lg font-semibold">{completedSteps} of {stepCount} steps complete</p>
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
          <span className="font-semibold">Reviewer feedback: </span>{status.reviewerNotes}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Building2} label="Agreements" value={overview.agreements.length} />
        <Metric icon={Truck} label="Vehicles" value={overview.totalVehicles} />
        <Metric icon={ShieldCheck} label="Certificates" value={overview.totalCertificates} />
        <Metric icon={Zap} label="Energy reports" value={overview.totalEnergyRecords} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Onboarding checklist</h2>
              <p className="mt-1 text-sm text-neutral-500">Your information is saved to your supplier account.</p>
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
            <h3 className="mb-1 text-sm font-semibold text-neutral-800">Agreements</h3>
            <p className="mb-3 text-xs text-neutral-500">
              The administrator selects which information is required for each agreement.
            </p>
            {overview.agreements.length === 0 ? (
              <p className="text-sm text-neutral-500">No agreements are linked to this supplier account yet.</p>
            ) : (
              <ul className="space-y-2">
                {overview.agreements.map((agreement) => (
                  <li key={agreement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-800">{agreementLabel(agreement)}</span>
                      <CopyableValue label="Agreement ID" value={agreement.id} />
                    </span>
                    <span className="text-right text-neutral-500">
                      {[
                        agreement.requiresVehicles && "Vehicles",
                        agreement.requiresEnergy && "Energy",
                        agreement.requiresProducts && "Products",
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold text-neutral-900">Sustainability contact</h2>
          <p className="mt-1 text-sm text-neutral-500">Who should the municipality contact about environmental reporting?</p>
          <form onSubmit={saveProfile} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-neutral-700">
              Contact name
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
              Email
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
              Phone <span className="font-normal text-neutral-500">(optional)</span>
              <input
                type="tel"
                pattern="\+?[0-9 \(\)\-]{4,20}"
                title="Enter a phone number, for example +47 123 45 678"
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
              Save contact
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Enter reporting data</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Complete the required details in the form. The system will validate and process your submission automatically.
            </p>
            {entity === "vehicles" && (
              <p className="mt-1 text-sm text-neutral-500">
                Only add vehicles you have actually used. Your approved list is already registered; vehicles that are not on it are checked with Statens vegvesen.
              </p>
            )}
          </div>
          <Boxes className="hidden h-5 w-5 text-primary-700 sm:block" aria-hidden="true" />
        </div>

        {locked ? (
          <p className="mt-5 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            Reporting changes are unavailable while this submission is {STATUS_LABELS[status.status].toLowerCase()}.
          </p>
        ) : status.requiredEntities.length === 0 ? (
          <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Your administrator has not assigned any information to collect yet.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-neutral-700">
                Information type
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
                    status.requiredEntities.includes(ENTITY_API_VALUES[option.value]),
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div role="tablist" aria-label="How to enter the data" className="inline-flex rounded-lg border border-neutral-200 p-0.5 text-sm">
              {([["form", "Fill in a form"], ["csv", "Upload a CSV file"]] as const).map(([value, label]) => (
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
                    ? "Vehicle details"
                    : entity === "energy"
                      ? "Energy facility details"
                      : "Product details"}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {preview.validRows} ready · {preview.errorRows} with errors · {preview.totalRows} total
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
                  Confirm import
                </button>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">Fix errors to import</span>
              )}
            </div>

            {preview.warnings?.map((warning) => <p key={warning} role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>)}

            {preview.errors.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-red-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-red-50 text-red-900">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-semibold">Row</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Field</th>
                      <th scope="col" className="px-3 py-2 font-semibold">Issue</th>
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
                    Showing 30 of {preview.errors.length} validation errors.
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
                        {["Agreement", "Vehicle", "Fuel / propulsion", "Hybrid", "Weight", "Checked with Statens vegvesen", "Coverage"].map((label) => (
                          <th scope="col" key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {preview.previewRows.map((row, index) => {
                        const agreement = overview.agreements.find((item) => item.id === row.agreement_id);
                        const fuel = Object.entries(FUEL_TECHNOLOGIES)
                          .find(([code]) => code === row.fuel_technology)?.[1] ?? "—";
                        const coverage = friendlyBoolean(row.full_contract_coverage) === "Yes"
                          ? "Full agreement period"
                          : row.start_year_week && row.end_year_week ? `${row.start_year_week} to ${row.end_year_week}` : "—";
                        return (
                          <tr key={index}>
                            <td className="px-3 py-2">{agreement ? agreementLabel(agreement) : row.agreement_id}</td>
                            <td className="px-3 py-2">{row.registration_number || "Planned vehicle"}</td>
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
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        {["Agreement", "Facility code", "Address", "Year", "Electricity", "District heating"].map((label) => (
                          <th scope="col" key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {preview.previewRows.map((row, index) => {
                        const agreement = overview.agreements.find((item) => item.id === row.agreement_id);
                        return (
                          <tr key={index}>
                            <td className="px-3 py-2">{agreement ? agreementLabel(agreement) : row.agreement_id}</td>
                            <td className="px-3 py-2 font-mono font-medium">{row.facility_location_code}</td>
                            <td className="px-3 py-2">{row.facility_address}</td>
                            <td className="px-3 py-2">{row.reporting_year}</td>
                            <td className="px-3 py-2">{row.electricity_kwh ? `${formatNumber(Number(row.electricity_kwh))} kWh` : "—"}</td>
                            <td className="px-3 py-2">{row.district_heating_kwh ? `${formatNumber(Number(row.district_heating_kwh))} kWh` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="bg-neutral-50 text-neutral-600">
                      <tr>
                        {["Agreement", "Product code", "Product name", "Category", "Ecolabel", "Unit", "Repaired/Reused"].map((label) => (
                          <th scope="col" key={label} className="whitespace-nowrap px-3 py-2 font-semibold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {preview.previewRows.map((row, index) => {
                        const agreement = overview.agreements.find((item) => item.id === row.agreement_id);
                        const category = PRODUCT_CATEGORIES[row.product_category] ?? row.product_category;
                        const ecolabel = row.ecolabel_standard === "NONE"
                          ? "None"
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
          <h2 className="font-semibold text-neutral-900">Ready to submit?</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Required information is checked by the server before it is sent for municipal review.
          </p>
          {!status.canSubmit && status.requiredEntities.length === 0 && (
            <p className="mt-2 text-sm text-amber-700">Ask your administrator to assign the information required under the agreement.</p>
          )}
        </div>
        <button
          type="button"
          disabled={working || !status.canSubmit}
          onClick={handleSubmit}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit onboarding
        </button>
      </section>
    </div>
  );
}
