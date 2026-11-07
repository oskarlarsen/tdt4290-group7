import { X, Truck, Info, Calendar, Zap, AlertCircle } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import type { Vehicle } from "../../types/vehicle";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  contractName: string | null;
}

export function VehicleDetailsModal({ isOpen, onClose, vehicle, contractName }: Props) {
  if (!isOpen || !vehicle) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="w-full max-w-2xl rounded-xl border border-neutral-100 bg-white shadow-card overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-neutral-50 px-5 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-3">
              <div className="bg-teal-100 p-2 rounded-lg text-teal-700">
                 <Truck className="h-5 w-5" />
              </div>
              <div>
                 <h2 className="font-headline text-lg font-bold text-neutral-900 uppercase tracking-wide font-mono">
                    {vehicle.registrationNumber || "Unregistered"}
                 </h2>
                 <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Vehicle Details
                 </p>
              </div>
           </div>
           <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 p-1.5 rounded-lg transition-colors">
             <X className="h-5 w-5" />
           </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-8">

           {/* General Information */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">General Information</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Make & Model</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">—</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Registration Number</p>
                      <p className="text-sm font-medium text-neutral-900 font-mono mt-0.5">{vehicle.registrationNumber || "—"}</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Vehicle Type</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">—</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Manufacturing Year</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">—</p>
                  </div>
              </div>
           </section>

           {/* Technical Information */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Technical Information</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Fuel / Energy Type</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">—</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Emission Class</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">—</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">CO₂ Emissions</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">—</p>
                  </div>
              </div>
           </section>

           {/* Contract Information */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Contract Information</h3>
              {contractName ? (
                 <div className="border border-neutral-200 rounded-xl p-4 bg-white flex justify-between items-center">
                    <div>
                       <h4 className="font-semibold text-sm text-neutral-900">Associated Contract</h4>
                       <p className="text-xs text-neutral-600 mt-0.5">{contractName}</p>
                    </div>
                    {vehicle.agreementId && (
                       <div className="text-right">
                          <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Reference</p>
                          <p className="text-xs font-mono text-neutral-500 mt-0.5">{vehicle.agreementId}</p>
                       </div>
                    )}
                 </div>
              ) : (
                 <div className="py-4 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-neutral-50/50">
                    <p>No contract association found.</p>
                 </div>
              )}
           </section>

           {/* Operational Information */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Operational Information</h3>
              <div className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row gap-6 justify-between bg-white items-start sm:items-center">
                  <div className="flex gap-8">
                      <div>
                          <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Added to Fleet</p>
                          <p className="text-sm font-medium text-neutral-900 mt-0.5">{formatDate(vehicle.createdAt)}</p>
                      </div>
                      <div>
                          <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Last Updated</p>
                          <p className="text-sm font-medium text-neutral-900 mt-0.5">{formatDate(vehicle.updatedAt)}</p>
                      </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${vehicle.planned ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                      {vehicle.planned ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {vehicle.planned ? "Information Requested" : "Tracked"}
                  </span>
              </div>
           </section>

        </div>
      </div>
    </div>
  );
}