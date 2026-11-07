import { X, FileText, Truck, Check, AlertTriangle } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import type { Certificate } from "../../types/certificate";
import type { Vehicle } from "../../types/vehicle";

interface Props {
  type: "certificates" | "vehicles";
  isOpen: boolean;
  onClose: () => void;
  certificates?: Certificate[];
  vehicles?: Vehicle[];
  getContractName: (id: string | null) => string;
}

export function InformationOnFileModal({ type, isOpen, onClose, certificates, vehicles, getContractName }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="w-full max-w-3xl rounded-xl border border-neutral-100 bg-white shadow-card overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-neutral-50 px-5 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-3">
              <div className="bg-teal-100 p-2 rounded-lg text-teal-700">
                 {type === "certificates" ? <FileText className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
              </div>
              <div>
                 <h2 className="font-headline text-lg font-bold text-neutral-900">
                    {type === "certificates" ? "Active Certificates" : "Registered Fleet"}
                 </h2>
                 <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">Information on File</p>
              </div>
           </div>
           <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 p-1.5 rounded-lg transition-colors">
             <X className="h-5 w-5" />
           </button>
        </div>

        <div className="p-5 overflow-y-auto">
           {type === "certificates" && certificates && (
               certificates.length === 0 ? (
                  <p className="text-center text-sm text-neutral-500 py-8">No active records found.</p>
               ) : (
                  <div className="grid grid-cols-1 gap-4">
                     {certificates.map(cert => (
                        <div key={cert.id} className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between bg-white hover:border-teal-300 transition-colors">
                           <div>
                              <div className="flex items-center gap-2 mb-1">
                                 <h3 className="font-bold text-sm uppercase tracking-wide text-neutral-900">{cert.standard.replace(/-/g, ' ')}</h3>
                                 <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200 uppercase">
                                    <Check className="h-3 w-3" /> Valid
                                 </span>
                              </div>
                              <p className="text-sm text-neutral-600 mb-3">{getContractName(cert.contractId)}</p>
                              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                 <div>
                                    <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Certificate Number</p>
                                    <p className="text-xs font-medium text-neutral-900 font-mono mt-0.5">{cert.certificateNumber || "—"}</p>
                                 </div>
                                 <div>
                                    <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Valid Until</p>
                                    <p className="text-xs font-medium text-neutral-900 mt-0.5">{cert.validUntil ? formatDate(cert.validUntil) : "—"}</p>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               )
           )}

           {type === "vehicles" && vehicles && (
               vehicles.length === 0 ? (
                  <p className="text-center text-sm text-neutral-500 py-8">No registered vehicles found.</p>
               ) : (
                  <div className="grid grid-cols-1 gap-4">
                     {vehicles.map((veh, idx) => (
                        <div key={veh.registrationNumber || idx} className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between bg-white hover:border-teal-300 transition-colors">
                           <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                 <h3 className="font-bold text-base font-mono text-neutral-900">{veh.registrationNumber || "Unregistered"}</h3>
                                 {veh.planned ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 uppercase">
                                       <AlertTriangle className="h-3 w-3" /> Planned
                                    </span>
                                 ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200 uppercase">
                                       <Check className="h-3 w-3" /> Tracked
                                    </span>
                                 )}
                              </div>
                              <p className="text-sm text-neutral-600 mb-3">{getContractName(veh.agreementId)}</p>
                              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                 <div>
                                    <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Added</p>
                                    <p className="text-xs font-medium text-neutral-900 mt-0.5">{new Date(veh.createdAt).toLocaleDateString()}</p>
                                 </div>
                                 <div>
                                    <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Status Details</p>
                                    <p className="text-xs font-medium text-neutral-900 mt-0.5">{veh.planned ? "Information requested" : "Data complete"}</p>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               )
           )}
        </div>
      </div>
    </div>
  );
}