import { useMemo, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AgreementCard } from "../../components/vehicles/AgreementCard";
import { AgreementForm } from "../../components/vehicles/FleetForms";
import { Field, inputClass, primaryClass, VehicleDialog } from "../../components/vehicles/VehicleDialog";
import { KpiCard } from "../../components/ui/KpiCard";
import { useFleet, useRefreshVehicles } from "../../hooks/useVehicles";
import { ContractDetailsDrawer } from "../../components/contracts/ContractDetailsDrawer";
import type { FleetAgreement, FleetSupplier } from "../../types/vehicle";
import { agreementStatusText, getAgreementStatus, type AgreementStatusFilter } from "../../utils/agreementStatus";
import { agreementLabel, hasSaksnr } from "../../utils/agreementLabel";

type Filter = AgreementStatusFilter | "Missing saksnr";
const STATUS_FILTERS: Filter[] = ["all", "Active", "Upcoming", "Expiring soon", "Expired", "Missing saksnr"];

export default function Contracts() {
  const fleet = useFleet();
  const refresh = useRefreshVehicles();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [isSupplierSelectionOpen, setIsSupplierSelectionOpen] = useState(false);
  const [isCreatingAgreement, setIsCreatingAgreement] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [openAgreement, setOpenAgreement] = useState<{ agreement: FleetAgreement; supplier: FleetSupplier } | null>(null);
  const query = search.trim().toLowerCase();
  const data = fleet.data;

  const agreements = useMemo(() => {
    if (!data) return [];
    const suppliers = new Map(data.suppliers.filter((supplier) => supplier.active).map((supplier) => [supplier.id, supplier]));
    return data.agreements.flatMap((agreement) => {
      const supplier = suppliers.get(agreement.supplierId);
      if (!supplier) return [];
      const status = getAgreementStatus(agreement);
      if (statusFilter === "Missing saksnr" ? hasSaksnr(agreement) : statusFilter !== "all" && status !== statusFilter) return [];
      if (query && !`${agreement.saksnr ?? ""} ${agreement.note} ${agreement.id} ${supplier.name} ${supplier.orgNumber}`.toLowerCase().includes(query)) return [];
      return [{ agreement, supplier, status }];
    }).sort((a, b) => a.agreement.endDate.localeCompare(b.agreement.endDate));
  }, [data, query, statusFilter]);

  const activeAgreements = data?.agreements.filter((agreement) => agreement.active) ?? [];
  const expiringCount = activeAgreements.filter((agreement) => getAgreementStatus(agreement) === "Expiring soon").length;
  const expiredCount = activeAgreements.filter((agreement) => getAgreementStatus(agreement) === "Expired").length;

  function saved() {
    setIsSupplierSelectionOpen(false);
    setIsCreatingAgreement(false);
    setSelectedSupplierId("");
    void refresh();
  }

  const selectedSupplier = data?.suppliers.find(
    (supplier) => supplier.id === selectedSupplierId && supplier.active,
  );

  return (
    <div className="space-y-5 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-neutral-900">Agreements</h1>
        </div>
        <button
          type="button"
          className={primaryClass}
          disabled={!data?.suppliers.some((supplier) => supplier.active)}
          onClick={() => setIsSupplierSelectionOpen(true)}
        >
          <Plus className="h-4 w-4" /> Add agreement
        </button>
      </header>

      {data && <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Stored active agreements" value={activeAgreements.length} sublabel={`${data.suppliers.filter((supplier) => supplier.active).length} active suppliers`} icon={<FileText className="h-4 w-4" />} />
        <KpiCard label="Expiring within 90 days" value={expiringCount} sublabel="Based on agreement end dates" icon={<FileText className="h-4 w-4" />} />
        <KpiCard label="Past end date" value={expiredCount} sublabel="Agreement remains stored as active" icon={<FileText className="h-4 w-4" />} />
      </div>}

      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="relative block w-full max-w-sm text-xs font-medium text-neutral-600">
            Search agreements or suppliers
            <Search className="absolute left-3 top-9 h-4 w-4 text-neutral-400" />
            <input className={`${inputClass} mt-2 pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, organization number or saksnr" />
          </label>
          <label className="text-xs font-medium text-neutral-600">
            Agreement status
            <select className={`${inputClass} mt-2`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Filter)}>
              {STATUS_FILTERS.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : status}</option>)}
            </select>
          </label>
        </div>

        {fleet.isLoading && <p role="status" className="py-8 text-center text-sm text-neutral-500">Loading agreements…</p>}
        {fleet.isError && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{fleet.error instanceof Error ? fleet.error.message : "Could not load agreements."}<button type="button" className="ml-3 font-medium underline" onClick={() => void fleet.refetch()}>Try again</button></div>}
        {data && agreements.length === 0 && <p className="py-8 text-center text-sm text-neutral-500">{data.agreements.length === 0 ? "No agreements are stored yet." : "No agreements match these filters."}</p>}
        <div className="space-y-4">
          {agreements.map(({ agreement, supplier, status }) => (
            <article key={agreement.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-neutral-800">
                  <button type="button" className="text-left hover:underline" onClick={() => setOpenAgreement({ agreement, supplier })}>
                    {supplier.name} · {agreementLabel(agreement)}
                  </button>
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Requested from supplier: {[
                    agreement.requiresVehicles && "vehicles",
                    agreement.requiresEnergy && "energy",
                    agreement.requiresProducts && "products",
                  ].filter(Boolean).join(", ")}
                </p>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${status === "Expired" ? "bg-red-100 text-red-700" : status === "Expiring soon" ? "bg-amber-100 text-amber-800" : status === "Upcoming" ? "bg-blue-100 text-blue-700" : "bg-tertiary-100 text-tertiary-700"}`}>{agreementStatusText(agreement)}</span>
              </div>
              <AgreementCard
                supplier={supplier}
                agreement={agreement}
                vehicles={data!.vehicles.filter((vehicle) => vehicle.agreementId === agreement.id)}
                onOpen={(plate) => navigate(`/admin/vehicles?plate=${encodeURIComponent(plate)}`)}
              />
            </article>
          ))}
        </div>
      </section>

      {isSupplierSelectionOpen && data && !isCreatingAgreement && <VehicleDialog title="Choose supplier for agreement" onClose={() => setIsSupplierSelectionOpen(false)}>
        <Field label="Supplier">
          <select autoFocus required className={inputClass} value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)}>
            <option value="">Select a supplier</option>
            {data.suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.orgNumber}</option>)}
          </select>
        </Field>
        <div className="mt-4 flex justify-end"><button type="button" disabled={!selectedSupplierId} className={primaryClass} onClick={() => setIsCreatingAgreement(true)}>Continue</button></div>
      </VehicleDialog>}
      {isSupplierSelectionOpen && isCreatingAgreement && selectedSupplier && <AgreementForm supplier={selectedSupplier} onClose={() => { setIsSupplierSelectionOpen(false); setIsCreatingAgreement(false); setSelectedSupplierId(""); }} onSaved={saved} />}
      <ContractDetailsDrawer agreement={openAgreement?.agreement ?? null} supplier={openAgreement?.supplier ?? null} onClose={() => setOpenAgreement(null)} />
    </div>
  );
}
