import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFleet, useRefreshVehicles } from "../../hooks/useVehicles";
import type { FleetSupplier } from "../../types/vehicle";
import { normalizePlate } from "../../utils/vehicle";
import { AgreementCard } from "../../components/vehicles/AgreementCard";
import { AgreementForm } from "../../components/vehicles/FleetForms";
import { ActionNotice } from "../../components/vehicles/ActionNotice";
import { ChangeHistory } from "../../components/vehicles/ChangeHistory";
import { VehicleDetails } from "../../components/vehicles/VehicleDetails";
import { StatisticsForm } from "../../components/vehicles/VehicleForms";
import { StatisticsDirectory } from "../../components/vehicles/StatisticsDirectory";
import { ErrorNotice, buttonClass, primaryClass, inputClass } from "../../components/vehicles/VehicleDialog";

export default function Vehicles() {
  const fleet = useFleet();
  const refresh = useRefreshVehicles();
  const [params, setParams] = useSearchParams();
  const plate = params.get("plate");
  const [search, setSearch] = useState("");
  const [agreementSupplier, setAgreementSupplier] = useState<FleetSupplier | null>(null);
  const [statistics, setStatistics] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  function open(plate: string) { setParams({ plate }); }
  function saved() { setAgreementSupplier(null); setStatistics(false); void refresh(); }
  const query = search.trim().toLowerCase();
  const data = fleet.data;
  const suppliers = data?.suppliers.filter(supplier => {
    const agreementIds = new Set(data.agreements.filter(a => a.supplierId === supplier.id).map(a => a.id));
    return `${supplier.name} ${supplier.orgNumber}`.toLowerCase().includes(query) || data.vehicles.some(v => agreementIds.has(v.agreementId ?? "") && v.registrationNumber.toLowerCase().includes(normalizePlate(query).toLowerCase()));
  });
  return <div className="space-y-5 p-4">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-headline text-2xl font-semibold tracking-tight text-neutral-900">Vehicles</h1>
      <div className="flex gap-2"><button className={buttonClass} onClick={() => setStatistics(true)}>Add reported data</button></div>
    </header>
    <p className="text-sm text-neutral-500">Create organizations and invite supplier contacts from <Link to="/admin/suppliers" className="font-medium text-primary-900 underline">Suppliers</Link>.</p>
    <ActionNotice latest={data?.changes[0]} ready={!!data} />
    <label className="block max-w-md text-xs font-medium text-neutral-600">Find supplier, organization number or vehicle<input type="search" className={`${inputClass} mt-2`} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search..." /></label>
    {fleet.isLoading && <p role="status">Loading suppliers...</p>}
    <ErrorNotice error={fleet.error} />
    {fleet.isError && <button className={buttonClass} onClick={() => void fleet.refetch()}>Try again</button>}
    <div className="space-y-4">{suppliers?.map(supplier => {
      const agreements = data!.agreements.filter(a => a.supplierId === supplier.id);
      return <details key={supplier.id} className="group rounded-xl border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-4 py-4"><span className="ml-2 font-medium text-neutral-900">{supplier.name}</span><span className="ml-3 text-xs text-neutral-500">{supplier.orgNumber}</span></summary>
        <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium text-neutral-700">Agreements</h2><button className={primaryClass} onClick={() => setAgreementSupplier(supplier)}>Add agreement</button></div>
          {agreements.map(agreement => <AgreementCard key={agreement.id} supplier={supplier} agreement={agreement} vehicles={data!.vehicles.filter(v => v.agreementId === agreement.id)} onOpen={open} />)}
          {!agreements.length && <p className="text-sm text-neutral-500">No agreements yet.</p>}
        </div>
      </details>;
    })}</div>
    {data && !suppliers?.length && <p className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500">{query ? "No matching suppliers or vehicles." : "Add a supplier in Suppliers to create your first agreement."}</p>}
    <details onToggle={event => setShowStatistics(event.currentTarget.open)} className="rounded-xl border border-neutral-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Reported data</summary>{showStatistics && <div className="mt-4"><StatisticsDirectory onOpenVehicle={open} /></div>}</details>
    <details onToggle={event => setShowHistory(event.currentTarget.open)} className="rounded-xl border border-neutral-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Change history</summary>{showHistory && <div className="mt-3"><ChangeHistory /></div>}</details>
    {plate && <VehicleDetails key={plate} plate={plate} onClose={() => setParams({})} />}
    {agreementSupplier && <AgreementForm supplier={agreementSupplier} onClose={() => setAgreementSupplier(null)} onSaved={saved} />}
    {statistics && <StatisticsForm onClose={() => setStatistics(false)} onSaved={() => saved()} />}
  </div>;
}
