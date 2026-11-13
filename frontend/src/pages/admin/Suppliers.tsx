import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useDashboardSummary } from "../../hooks/useDashboardSummary";
import { useSupplierReviewStatus, type FollowUpStatus } from "../../hooks/useSupplierReviewStatus";
import { useFleet, useRefreshVehicles } from "../../hooks/useVehicles";
import { TopRiskSuppliersTable, type SupplierSortDirection, type SupplierSortKey } from "../../components/suppliers/TopRiskSuppliersTable";
import { SupplierDetailsDrawer } from "../../components/suppliers/SupplierDetailsDrawer";
import { SupplierDetailsDialog } from "../../components/suppliers/SupplierDetailsDialog";
import { useAlerts } from "../../hooks/useAlerts";
import { SupplierReportingDataDialog } from "../../components/suppliers/SupplierReportingDataDialog";
import { SuppliersOverviewHeader } from "../../components/suppliers/SuppliersOverviewHeader";
import { ArchivedSuppliers } from "../../components/suppliers/ArchivedSuppliers";
import { AgreementForm, InviteSupplierForm, RemoveSupplierAction, SupplierForm } from "../../components/vehicles/FleetForms";
import { ErrorNotice, buttonClass, primaryClass } from "../../components/vehicles/VehicleDialog";
import { toCsv, downloadCsv } from "../../utils/csv";
import type { TopRiskSupplier } from "../../types/dashboard";
import type { FleetSupplier } from "../../types/vehicle";

const RISK_ORDER: Record<TopRiskSupplier["risk"], number> = {
  high: 0,
  medium: 1,
  low: 2,
  compliant: 3,
  unassessed: 4,
};
const RISK_LABELS: Record<TopRiskSupplier["risk"], string> = {
  high: "Høy",
  medium: "Middels",
  low: "Lav",
  compliant: "Ingen funn",
  unassessed: "Ikke vurdert",
};
const SUPPLIERS_PAGE_SIZE = 10;
const ISSUE_FILTER_CATEGORY = { vehicle: "VEHICLE_DEVIATION", certificate: "CERTIFICATE_EXPIRY", energy: "ENERGY_DEVIATION" } as const;

/** One organization: name and org number, with its actions folded away behind a dropdown button. */
function OrganizationRow({ supplier, highlighted, agreementCount, vehicleCount, onEdit, onReporting, onInvite, onRemoved }: {
  supplier: FleetSupplier;
  highlighted: boolean;
  agreementCount: number;
  vehicleCount: number;
  onEdit: () => void;
  onReporting: () => void;
  onInvite: () => void;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(highlighted);
  const panelId = `org-actions-${supplier.id}`;
  return (
    <li id={`org-${supplier.id}`} className={`rounded-lg border p-3 ${highlighted ? "border-primary-700 ring-2 ring-primary-700/20" : "border-neutral-100"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">{supplier.name}</p>
          <p className="font-mono text-xs text-neutral-500">{supplier.orgNumber}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Skjul" : "Vis"} handlinger for ${supplier.name}`}
          className={`${buttonClass} gap-1`}
        >
          Handlinger
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          <button type="button" className={buttonClass} onClick={onEdit}>Rediger</button>
          <button type="button" className={buttonClass} onClick={onReporting}>Innsendt informasjon</button>
          <button type="button" className={buttonClass} onClick={onInvite}>Inviter kontaktperson</button>
          <Link to="/admin/vehicles" className={buttonClass}>Administrer avtaler og kjøretøy</Link>
          <RemoveSupplierAction supplier={supplier} agreementCount={agreementCount} vehicleCount={vehicleCount} onRemoved={onRemoved} />
        </div>
      )}
    </li>
  );
}

export default function Suppliers() {
  const { data, isLoading, isError } = useDashboardSummary();
  const queryClient = useQueryClient();
  const fleet = useFleet();
  const refreshFleet = useRefreshVehicles();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  // The large Details window replaces the side panel while it is open.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { data: allAlerts = [] } = useAlerts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [organizationForm, setOrganizationForm] = useState<FleetSupplier | "new" | null>(null);
  const [agreementSupplier, setAgreementSupplier] = useState<FleetSupplier | null>(null);
  const [invitationSupplier, setInvitationSupplier] = useState<FleetSupplier | null>(null);
  const [reportingSupplier, setReportingSupplier] = useState<FleetSupplier | null>(null);
  // The risk filter lives in the URL so dashboard links such as ?risk=high can set it.
  const riskParam = searchParams.get("risk");
  const riskFilter: "all" | TopRiskSupplier["risk"] =
    riskParam === "high" || riskParam === "medium" || riskParam === "low" || riskParam === "compliant" || riskParam === "unassessed" ? riskParam : "all";
  function setRiskFilter(next: "all" | TopRiskSupplier["risk"]) {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("risk");
    else params.set("risk", next);
    setSearchParams(params, { replace: true });
  }
  const issueParam = searchParams.get("issue");
  const issueFilter: "all" | "vehicle" | "certificate" | "energy" =
    issueParam === "vehicle" || issueParam === "certificate" || issueParam === "energy" ? issueParam : "all";
  function setIssueFilter(next: "all" | "vehicle" | "certificate" | "energy") {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("issue");
    else params.set("issue", next);
    setSearchParams(params, { replace: true });
  }
  const [reviewStatusFilter, setReviewStatusFilter] = useState<"all" | FollowUpStatus>("all");
  const [sort, setSort] = useState<{ key: SupplierSortKey; direction: SupplierSortDirection }>({ key: "risk", direction: "asc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [successMessage, setSuccessMessage] = useState("");
  const { getStatus, setStatus, errorMessage: reviewStatusError } = useSupplierReviewStatus();

  useEffect(() => {
    setPage(1);
  }, [search, riskFilter, issueFilter, reviewStatusFilter]);

  /** Open the existing supplier drawer when reached from other pages */
  const orgParam = searchParams.get("org") ?? searchParams.get("supplierId");
  const highlightedOrg = fleet.data?.suppliers.find((organization) => organization.id === orgParam)?.id ?? null;
  useEffect(() => {
    const id = searchParams.get("supplierId");
    // A real organization has no drawer: it is highlighted in the list below instead.
    if (id && !fleet.isLoading && !fleet.data?.suppliers.some((organization) => organization.id === id)) setSelectedSupplierId(id);
  }, [searchParams, fleet.isLoading, fleet.data]);
  useEffect(() => {
    if (highlightedOrg) document.getElementById(`org-${highlightedOrg}`)?.scrollIntoView({ block: "center" });
  }, [highlightedOrg]);

  function handleCloseDrawer() {
    setSelectedSupplierId(null);
    setDetailsOpen(false);
    if (searchParams.get("supplierId")) {
      const next = new URLSearchParams(searchParams);
      next.delete("supplierId");
      setSearchParams(next, { replace: true });
    }
  }

  function handleOrganizationSaved(savedSupplier: FleetSupplier) {
    const isNewSupplier = organizationForm === "new";
    setOrganizationForm(null);
    void refreshFleet();
    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    if (isNewSupplier) {
      setAgreementSupplier(savedSupplier);
      setSuccessMessage("Leverandør opprettet. Sett opp avtalen og påkrevd informasjon før du inviterer kontaktpersonen.");
    } else {
      setSuccessMessage("Leverandørorganisasjonen er lagret.");
    }
  }

  function handleAgreementSaved() {
    const supplier = agreementSupplier;
    setAgreementSupplier(null);
    void refreshFleet();
    if (supplier) setInvitationSupplier(supplier);
    setSuccessMessage("Avtalen er lagret. Opprett en invitasjon til leverandørens kontaktperson.");
  }

  function handleSupplierReactivated(supplier: FleetSupplier) {
    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    setAgreementSupplier(supplier);
    setSuccessMessage(`${supplier.name} is active again. Create a new agreement, then invite a contact: its old accounts stay blocked.`);
  }

  function handleOrganizationRemoved() {
    void refreshFleet();
    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    setSuccessMessage("Leverandørorganisasjonen er fjernet.");
  }

  // Default: highest risk first. "asc" on Risk means high -> unassessed; ties fall back to name.
  const sign = sort.direction === "asc" ? 1 : -1;
  const sortedSuppliers = [...(data?.topRiskSuppliers ?? [])].sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName);
    // Within a risk level the higher score (more and heavier findings) comes first.
    const primary = sort.key === "risk"
      ? RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || (b.riskScore ?? 0) - (a.riskScore ?? 0)
      : byName;
    return (primary || byName) * (primary ? sign : 1);
  });
  function handleSort(key: SupplierSortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }
  const query = search.trim().toLowerCase();
  const filteredSuppliers = sortedSuppliers.filter((supplier) => {
    const matchesRisk = riskFilter === "all" || supplier.risk === riskFilter;
    const categories = supplier.issueCategories ?? (supplier.issueCategory ? [supplier.issueCategory] : []);
    const matchesIssue =
      issueFilter === "all" || categories.includes(ISSUE_FILTER_CATEGORY[issueFilter]);
    const matchesReviewStatus =
      reviewStatusFilter === "all" || getStatus(supplier.id) === reviewStatusFilter;
    const matchesSearch =
      query.length === 0 ||
      supplier.displayName.toLowerCase().includes(query) ||
      supplier.orgId.toLowerCase().includes(query) ||
      supplier.primaryContract.toLowerCase().includes(query) ||
      supplier.mainIssue.toLowerCase().includes(query);
    return matchesRisk && matchesIssue && matchesReviewStatus && matchesSearch;
  });
  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / SUPPLIERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * SUPPLIERS_PAGE_SIZE;
  const paginatedSuppliers = filteredSuppliers.slice(pageStart, pageStart + SUPPLIERS_PAGE_SIZE);
  const selectedSupplier = sortedSuppliers.find((s) => s.id === selectedSupplierId) ?? null;

  function handleExportDirectory() {
    const csv = toCsv(
      sortedSuppliers.map((s) => ({
        Leverandør: s.displayName,
        "Org.nr.": s.orgId,
        Avtale: s.primaryContract,
        Risiko: RISK_LABELS[s.risk],
        "Hovedproblem": s.mainIssue,
      }))
    );
    downloadCsv(`leverandorer-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      {reviewStatusError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Kunne ikke lagre vurderingsstatus for leverandør: {reviewStatusError}
        </p>
      )}
      {isLoading && (
        <div role="status" className="flex h-12 items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Laster risikodashbord for leverandører…
        </div>
      )}
      {(isError || !data) && !isLoading && (
        <p role="alert" className="text-sm text-red-700">Kunne ikke laste risikodashbordet for leverandører. Organisasjonsadministrasjonen er fortsatt tilgjengelig nedenfor.</p>
      )}
      {data && (
        <SuppliersOverviewHeader
          monitoredSuppliers={data.kpis.monitoredSuppliers}
          modeledSupplierCount={sortedSuppliers.length}
          highCount={data.riskClassification.high.count}
          mediumCount={data.riskClassification.medium.count}
          lowCount={data.riskClassification.low.count}
          activeRisk={riskFilter}
          onSelectRisk={(next) => setRiskFilter(next === riskFilter ? "all" : next)}
          compliantCount={data.riskClassification.compliant.count}
          compliantPercent={data.riskClassification.compliant.percent}
          onExport={handleExportDirectory}
          onAddSupplier={() => setOrganizationForm("new")}
        />
      )}

      {successMessage && (
        <p role="status" className="rounded-lg border border-tertiary-200 bg-tertiary-50 px-3 py-2 text-sm text-tertiary-700">
          {successMessage}
        </p>
      )}


      <ArchivedSuppliers onReactivated={handleSupplierReactivated} />

      {data && <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Søk etter leverandører…"
              aria-label="Søk etter leverandører"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-500 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Risiko:</span>
              <select
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value as "all" | TopRiskSupplier["risk"])}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                aria-label="Filtrer leverandører etter risikonivå"
              >
                <option value="all">Alle</option>
                <option value="high">Høy</option>
                <option value="medium">Middels</option>
                <option value="low">Lav</option>
                <option value="compliant">Ingen funn</option>
                <option value="unassessed">Ikke vurdert</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Problem:</span>
              <select
                value={issueFilter}
                onChange={(event) => setIssueFilter(event.target.value as "all" | "vehicle" | "certificate" | "energy")}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                aria-label="Filtrer leverandører etter problemkategori"
              >
                <option value="all">Alle</option>
                <option value="vehicle">Kjøretøyavvik</option>
                <option value="certificate">Sertifikatproblemer</option>
                <option value="energy">Energiavvik</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="font-medium text-neutral-700">Vurderingsstatus:</span>
              <select
                value={reviewStatusFilter}
                onChange={(event) => setReviewStatusFilter(event.target.value as "all" | FollowUpStatus)}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
                aria-label="Filtrer leverandører etter vurderingsstatus"
              >
                <option value="all">Alle</option>
                <option value="to-review">Til vurdering</option>
                <option value="in-progress">Under arbeid</option>
                <option value="resolved">Løst</option>
              </select>
            </label>
          </div>
        </div>

        {filteredSuppliers.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-500">Ingen leverandører samsvarer med valgte filtre.</div>
        ) : (
          <TopRiskSuppliersTable
            suppliers={paginatedSuppliers}
            sort={sort}
            onSort={handleSort}
            actionLabel="Vis detaljer"
            onSelect={(supplier) => setSelectedSupplierId(supplier.id)}
            getReviewStatus={getStatus}
            showOnboardingStatus
          />
        )}

        <div className="-mx-4 -mb-4 mt-4 flex items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="min-w-0 text-xs text-neutral-500">
            Viser {filteredSuppliers.length === 0 ? 0 : pageStart + 1}–
            {Math.min(pageStart + SUPPLIERS_PAGE_SIZE, filteredSuppliers.length)} av {filteredSuppliers.length} {filteredSuppliers.length === 1 ? "leverandør" : "leverandører"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Forrige
            </button>
            <span className="font-mono text-xs text-neutral-500">
              Side {currentPage} av {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Neste
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>}

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Leverandørorganisasjoner</h2>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              Opprett en leverandør, sett opp avtalen og påkrevde rapporteringskategorier, og inviter kontaktpersonen til å sende inn kun den etterspurte informasjonen.
            </p>
          </div>
        </div>

        {fleet.isLoading && <p role="status" className="text-sm text-neutral-500">Laster leverandørorganisasjoner…</p>}
        {fleet.isError && <div className="space-y-2"><ErrorNotice error={fleet.error} /><button type="button" className={buttonClass} onClick={() => void fleet.refetch()}>Prøv igjen</button></div>}
        {fleet.data && fleet.data.suppliers.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-200 p-5 text-center text-sm text-neutral-500">
            Ingen organisasjoner ennå. Legg til en for å opprette avtaler og invitere en kontaktperson hos leverandøren.
          </p>
        )}
        {fleet.data && fleet.data.suppliers.length > 0 && (
          <ul className="space-y-3">
            {fleet.data.suppliers.map((supplier) => (
              <OrganizationRow
                key={supplier.id}
                supplier={supplier}
                highlighted={supplier.id === highlightedOrg}
                agreementCount={fleet.data.agreements.filter((agreement) => agreement.supplierId === supplier.id && agreement.active).length}
                vehicleCount={fleet.data.vehicles.filter((vehicle) => vehicle.listed && fleet.data.agreements.some((agreement) => agreement.id === vehicle.agreementId && agreement.supplierId === supplier.id && agreement.active)).length}
                onEdit={() => setOrganizationForm(supplier)}
                onReporting={() => setReportingSupplier(supplier)}
                onInvite={() => setInvitationSupplier(supplier)}
                onRemoved={handleOrganizationRemoved}
              />
            ))}
          </ul>
        )}
      </section>

      <SupplierDetailsDrawer
        supplier={detailsOpen ? null : selectedSupplier}
        alerts={allAlerts}
        reviewStatus={selectedSupplier ? getStatus(selectedSupplier.id) : "to-review"}
        onChangeReviewStatus={(status) => selectedSupplier && setStatus(selectedSupplier.id, status)}
        trackingSince={data?.activityTrackingSince}
        onOpenDetails={() => setDetailsOpen(true)}
        onClose={handleCloseDrawer}
      />
      {detailsOpen && selectedSupplier && (
        <SupplierDetailsDialog
          supplier={selectedSupplier}
          trackingSince={data?.activityTrackingSince}
          alerts={allAlerts.filter((alert) => alert.supplierId === selectedSupplier.id && alert.status !== "RESOLVED")}
          onClose={() => setDetailsOpen(false)}
        />
      )}
      {organizationForm && (
        <SupplierForm
          supplier={organizationForm === "new" ? undefined : organizationForm}
          onClose={() => setOrganizationForm(null)}
          onSaved={handleOrganizationSaved}
        />
      )}
      {agreementSupplier && (
        <AgreementForm
          supplier={agreementSupplier}
          onClose={() => setAgreementSupplier(null)}
          onSaved={handleAgreementSaved}
        />
      )}
      {invitationSupplier && (
        <InviteSupplierForm supplier={invitationSupplier} onInvited={() => setSuccessMessage(`Invitasjon opprettet for ${invitationSupplier.name}.`)} onClose={() => setInvitationSupplier(null)} />
      )}
      {reportingSupplier && (
        <SupplierReportingDataDialog supplier={reportingSupplier} onClose={() => setReportingSupplier(null)} />
      )}
    </div>
  );
}