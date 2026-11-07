import { useState, useMemo } from "react";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Truck, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import type { Vehicle } from "../../types/vehicle";
import { PageHeader } from "../../components/ui/PageHeader";
import { VehicleDetailsModal } from "../../components/supplier/VehicleDetailsModal";

type FilterType = "All" | "Tracked" | "Information Requested";

export default function MyVehicles() {
  const { data, isLoading, isError, error } = useMySupplierOverview();
  const [filterType, setFilterType] = useState<FilterType>("All");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const raw = data?.raw;
  const contracts = data?.contracts || [];
  const supplierId = data?.contract?.supplierId || data?.supplier?.orgId;

  const myVehicles = useMemo(() => {
     if (!raw?.vehicles || !supplierId) return [];
     const myAgreement = raw.vehicles.agreements.find(a => a.supplierId === supplierId || a.supplierId === "sup-c");
     if (myAgreement) {
         return raw.vehicles.vehicles.filter(v => v.agreementId === myAgreement.id);
     }
     return [];
  }, [raw, supplierId]);

  const getContractName = (agreementId: string | null) => {
    if (contracts.length > 0) return contracts[0].contractName;
    return "Municipal Contract";
  };

  const filteredAndSortedVehicles = useMemo(() => {
     let result = [...myVehicles];

     if (filterType !== "All") {
        result = result.filter(v => {
           const status = v.planned ? "Information Requested" : "Tracked";
           return status === filterType;
        });
     }

     result.sort((a, b) => {
        // Sort by 'Information Requested' (planned: true) first
        if (a.planned && !b.planned) return -1;
        if (!a.planned && b.planned) return 1;

        // Then alphabetically by registration number
        return (a.registrationNumber || "").localeCompare(b.registrationNumber || "");
     });

     return result;
  }, [myVehicles, filterType]);

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const selectedVehicle = myVehicles.find(v => v.registrationNumber === selectedVehicleId) || null;
  const relatedContractName = selectedVehicle ? getContractName(selectedVehicle.agreementId) : null;

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Vehicle Directory"
        description="View your registered fleet and vehicle technical details."
      />

      <div className="bg-white rounded-xl shadow-sm border border-neutral-100 p-4">
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar w-full">
          {(["All", "Tracked", "Information Requested"] as FilterType[]).map(ft => (
              <button
                key={ft}
                onClick={() => setFilterType(ft)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${filterType === ft ? 'bg-primary-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
              >
                 {ft}
              </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
         {filteredAndSortedVehicles.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 flex flex-col items-center">
               <Truck className="h-6 w-6 text-neutral-300 mb-2" />
               <p>No registered vehicles found.</p>
            </div>
         ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                   <thead className="bg-neutral-50 border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                      <tr>
                         <th className="px-6 py-4">Make & Model</th>
                         <th className="px-6 py-4">Registration</th>
                         <th className="px-6 py-4">Vehicle Type</th>
                         <th className="px-6 py-4">Fuel / Energy</th>
                         <th className="px-6 py-4">Year</th>
                         <th className="px-6 py-4">Operational Status</th>
                         <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-neutral-100">
                      {filteredAndSortedVehicles.map((vehicle, idx) => {
                         const identifier = vehicle.registrationNumber || `unregistered-${idx}`;
                         return (
                            <tr key={identifier} className="hover:bg-neutral-50 transition-colors">
                               <td className="px-6 py-4 text-neutral-500 text-xs">—</td>
                               <td className="px-6 py-4">
                                  <div className="font-mono font-bold text-neutral-900">
                                     {vehicle.registrationNumber || "Unregistered"}
                                  </div>
                               </td>
                               <td className="px-6 py-4 text-neutral-500 text-xs">—</td>
                               <td className="px-6 py-4 text-neutral-500 text-xs">—</td>
                               <td className="px-6 py-4 text-neutral-500 text-xs">—</td>
                               <td className="px-6 py-4">
                                  {vehicle.planned ? (
                                     <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 uppercase tracking-wide">
                                        <AlertTriangle className="h-3 w-3" /> Information Requested
                                     </span>
                                  ) : (
                                     <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200 uppercase tracking-wide">
                                        <CheckCircle2 className="h-3 w-3" /> Tracked
                                     </span>
                                  )}
                               </td>
                               <td className="px-6 py-4 text-right">
                                  <button
                                     onClick={() => setSelectedVehicleId(identifier)}
                                     className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 transition-colors"
                                  >
                                     View Details
                                     <ChevronRight className="h-3 w-3" />
                                  </button>
                               </td>
                            </tr>
                         );
                      })}
                   </tbody>
                </table>
            </div>
         )}
      </div>

      <VehicleDetailsModal
         isOpen={!!selectedVehicleId}
         onClose={() => setSelectedVehicleId(null)}
         vehicle={selectedVehicle}
         contractName={relatedContractName}
      />
    </div>
  );
}