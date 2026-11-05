import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Download,
  FileCheck2,
  Leaf,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Truck,
  Upload,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  confirmCsv,
  downloadCsvTemplate,
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

const ENTITY_OPTIONS: Array<{ value: CsvEntity; label: string }> = [
  { value: "vehicles", label: "Vehicles" },
  { value: "energy", label: "Energy" },
  { value: "products", label: "Products" },
];

const CSV_FIELD_GUIDES: Record<CsvEntity, { description: string; fields: Array<[string, string]> }> = {
  vehicles: {
    description: "Contract vehicles and planned vehicles. Fuel technology must match the code in the Statens vegvesen catalog.",
    fields: [
      ["agreement_id", "Required. Copy an active agreement ID from the Agreements list."],
      ["registration_number", "Required for registered vehicles (for example AB12345); leave blank when is_planned is TRUE."],
      ["is_planned", "Required. TRUE or FALSE."],
      ["fuel_technology", "Required. Statens vegvesen fuel/propulsion code."],
      ["is_hybrid", "Required. TRUE or FALSE."],
      ["full_contract_coverage", "Required. TRUE for the whole agreement period; otherwise FALSE and provide both weeks."],
      ["start_year_week / end_year_week", "Required when coverage is FALSE. Use YYYY-Www, for example 2026-W08."],
      ["attachment_reference", "Optional reference to supporting contract documentation."],
      ["notes", "Optional notes. Do not include personal data such as driver names."],
    ],
  },
  energy: {
    description: "Annual energy consumption and facility area for each operating location.",
    fields: [
      ["agreement_id", "Required. Copy an active agreement ID from the Agreements list."],
      ["facility_location_code / facility_address", "Both required. Use a stable location code and its postal address."],
      ["storage_area_sqm / workshop_area_sqm / other_area_sqm", "Optional non-negative square metres; leave unknown values blank."],
      ["reporting_year", "Required integer from 2020 through 2030."],
      ["electricity_kwh / district_heating_kwh", "Required, non-negative kWh values."],
      ["biogas_kwh / fossil_fuel_kwh / self_produced_solar_kwh / self_produced_heatpump_kwh", "Optional non-negative kWh values; blank is recorded as zero."],
      ["notes", "Optional notes about the location or reported values."],
    ],
  },
  products: {
    description: "Products delivered under an agreement, including reuse and environmental labels.",
    fields: [
      ["agreement_id", "Required. Copy an active agreement ID from the Agreements list."],
      ["product_code / product_name", "Both required. Use a stable product code and the product's name."],
      ["product_category", "Required: FURNITURE, IT_EQUIPMENT, FOOD_BEVERAGE, CLEANING_SUPPLIES, or OTHER."],
      ["ecolabel_standard", "Required: NORDIC_SWAN, EU_ECOLABEL, MOBELFAKTA, BLUE_ANGEL, OEKO_TEX, EPD, or NONE."],
      ["license_number", "Required when an ecolabel other than NONE is selected."],
      ["unit_of_measure", "Required: PCS, KG, or LITRE."],
      ["is_repaired_or_reused", "Required. TRUE or FALSE."],
      ["notes", "Optional notes, such as spare-parts or reuse information."],
    ],
  },
};

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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextStatus, nextOverview] = await Promise.all([
      getOnboardingStatus(),
      getSupplierOverview(),
    ]);
    setStatus(nextStatus);
    setOverview(nextOverview);
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

  async function handlePreview() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    await perform(async () => {
      const result = await previewCsv(entity, file);
      setPreview(result);
      setNotice(result.canCommit ? "Validation passed. Review the rows before importing." : null);
    });
  }

  async function handleConfirm() {
    if (!preview?.canCommit) return;
    await perform(async () => {
      const result = await confirmCsv(entity, preview.batchId);
      setPreview(null);
      setFile(null);
      await refresh();
      setNotice(result.message);
    });
  }

  async function handleSubmit() {
    await perform(async () => {
      const result = await submitOnboarding();
      setStatus(result);
      await refresh();
      setNotice("Your onboarding information has been submitted for review.");
      navigate("/supplier/dashboard", { replace: true });
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
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
              Copy the agreement ID into the <code>agreement_id</code> column of each CSV row.
            </p>
            {overview.agreements.length === 0 ? (
              <p className="text-sm text-neutral-500">No agreements are linked to this supplier account yet.</p>
            ) : (
              <ul className="space-y-2">
                {overview.agreements.map((agreement) => (
                  <li key={agreement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-800">{agreement.note || agreement.id}</span>
                      <CopyableValue label="Agreement ID" value={agreement.id} />
                    </span>
                    <span className="text-neutral-500">{agreement.activeVehiclesCount} / {agreement.allowedVehicles} vehicles</span>
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
              Phone <span className="font-normal text-neutral-400">(optional)</span>
              <input
                type="tel"
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
            <h2 className="text-lg font-semibold text-neutral-900">Import reporting data</h2>
            <p className="mt-1 text-sm text-neutral-500">
                Download a blank template, use the field guide, validate the completed CSV, then confirm the import.
            </p>
          </div>

          <details className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-semibold text-neutral-800">
              {entity[0].toUpperCase() + entity.slice(1)} CSV field guide
            </summary>
            <div className="border-t border-neutral-200 p-3">
              <p className="mb-3 text-sm text-neutral-600">{CSV_FIELD_GUIDES[entity].description}</p>
              <p className="mb-3 text-xs text-neutral-600">
                Keep the downloaded column names and order unchanged. The template uses semicolons so Excel opens it in separate columns; comma-delimited CSV files are also accepted. Use TRUE/FALSE values and a dot for decimal separators. Every row must refer to one of the active agreement IDs listed above.
              </p>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="bg-neutral-100 text-neutral-700">
                    <tr><th className="px-3 py-2 font-semibold">CSV column</th><th className="px-3 py-2 font-semibold">What to enter</th></tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {CSV_FIELD_GUIDES[entity].fields.map(([field, description]) => (
                      <tr key={field}>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{field}</td>
                        <td className="px-3 py-2 text-neutral-600">{description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
          <Boxes className="hidden h-5 w-5 text-primary-700 sm:block" aria-hidden="true" />
        </div>

        {locked ? (
          <p className="mt-5 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            Reporting changes are unavailable while this submission is {STATUS_LABELS[status.status].toLowerCase()}.
          </p>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700">
                Data type
                <select
                  value={entity}
                  onChange={(event) => {
                    setEntity(event.target.value as CsvEntity);
                    setPreview(null);
                  }}
                  disabled={working}
                  className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
                >
                  {ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={working}
                onClick={() => perform(() => downloadCsvTemplate(entity), "Template downloaded.")}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download {entity} template
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700">
                CSV file
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setPreview(null);
                  }}
                  disabled={working}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-200 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:font-medium"
                />
              </label>
              <button
                type="button"
                disabled={working || !file}
                onClick={handlePreview}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-900 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Validate and preview
              </button>
            </div>
          </div>
        )}

        {preview && (
          <div className="mt-6 border-t border-neutral-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-neutral-900">{preview.fileName}</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {preview.validRows} valid · {preview.errorRows} with errors · {preview.totalRows} total
                </p>
              </div>
              {preview.canCommit ? (
                <button
                  type="button"
                  disabled={working}
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Confirm import
                </button>
              ) : (
                <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">Fix errors to import</span>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-red-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-red-50 text-red-900">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Row</th>
                      <th className="px-3 py-2 font-semibold">Column</th>
                      <th className="px-3 py-2 font-semibold">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {preview.errors.slice(0, 30).map((item, index) => (
                      <tr key={`${item.row}-${item.column}-${index}`}>
                        <td className="px-3 py-2">{item.row}</td>
                        <td className="px-3 py-2 font-mono text-xs">{item.column}</td>
                        <td className="px-3 py-2">{item.message}</td>
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
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-600">
                    <tr>
                      {Object.keys(preview.previewRows[0]).map((key) => (
                        <th key={key} className="whitespace-nowrap px-3 py-2 font-semibold">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {preview.previewRows.map((row, index) => (
                      <tr key={index}>
                        {Object.keys(preview.previewRows[0]).map((key) => (
                          <td key={key} className="max-w-56 truncate px-3 py-2">{row[key]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          {!status.canSubmit && status.steps.some((step) => step.stepKey === "CERTIFICATES" && !step.isCompleted) && (
            <p className="mt-2 text-sm text-amber-700">
              Ask your administrator to upload and link a certificate to an agreement before submitting.
            </p>
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
