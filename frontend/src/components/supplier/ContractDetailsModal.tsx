import { X, FileText, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import type { ContractOverview } from "../../utils/supplierOverview";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  overview: ContractOverview | null;
}

export function ContractDetailsModal({ isOpen, onClose, overview }: Props) {
  if (!isOpen || !overview) return null;

  const { contract, summaries, pendingReviews } = overview;
  const { certificates, vehicles } = summaries;

  const getCertStatus = () => {
    if (certificates.missing > 0 || certificates.expired > 0) return { label: "Needs Attention", className: "bg-red-50 text-red-700 border-red-200" };
    if (certificates.valid > 0 || certificates.expiring > 0) return { label: "On File", className: "bg-teal-50 text-teal-700 border-teal-200" };
    return { label: "Not Required", className: "bg-neutral-100 text-neutral-600 border-neutral-200" };
  };

  const getVehStatus = () => {
    if (vehicles.state === "data-missing") return { label: "Needs Attention", className: "bg-red-50 text-red-700 border-red-200" };
    if (vehicles.state === "normal") return { label: "On File", className: "bg-teal-50 text-teal-700 border-teal-200" };
    return { label: "Not Applicable", className: "bg-neutral-100 text-neutral-600 border-neutral-200" };
  };

  const certStatus = getCertStatus();
  const vehStatus = getVehStatus();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="w-full max-w-2xl rounded-xl border border-neutral-100 bg-white shadow-card overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-neutral-50 px-5 py-4 border-b border-neutral-200 flex items-center justify-between shrink-0">
           <div className="flex items-center gap-3">
              <div className="bg-primary-100 p-2 rounded-lg text-primary-900">
                 <FileText className="h-5 w-5" />
              </div>
              <div>
                 <h2 className="font-headline text-lg font-bold text-neutral-900">
                    {contract.contractName}
                 </h2>
                 <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">Ref: {contract.id}</p>
              </div>
           </div>
           <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 p-1.5 rounded-lg transition-colors">
             <X className="h-5 w-5" />
           </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-8">

           {/* A. Contract Information */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Contract Information</h3>
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Valid From</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">{formatDate(contract.startDate)}</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Valid Until</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">{formatDate(contract.endDate)}</p>
                  </div>
              </div>
           </section>

           {/* B. Contract Requirements */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Contract Requirements</h3>
              <div className="space-y-3">
                 <div className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between bg-white items-start sm:items-center">
                    <div>
                       <h4 className="font-bold text-sm text-neutral-900">Environmental Certificates</h4>
                       <p className="text-xs text-neutral-600 mt-0.5">Mandatory environmental documentation and accreditations</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${certStatus.className}`}>
                       {certStatus.label === "Needs Attention" && <AlertTriangle className="w-3 h-3" />}
                       {certStatus.label === "On File" && <CheckCircle2 className="w-3 h-3" />}
                       {certStatus.label}
                    </span>
                 </div>

                 <div className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between bg-white items-start sm:items-center">
                    <div>
                       <h4 className="font-bold text-sm text-neutral-900">Vehicle Fleet Data</h4>
                       <p className="text-xs text-neutral-600 mt-0.5">Fleet registration and emission tracking</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${vehStatus.className}`}>
                       {vehStatus.label === "Needs Attention" && <AlertTriangle className="w-3 h-3" />}
                       {vehStatus.label === "On File" && <CheckCircle2 className="w-3 h-3" />}
                       {vehStatus.label}
                    </span>
                 </div>
              </div>
           </section>

           {/* C. Submission Overview */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Submission Overview</h3>
              {pendingReviews.length === 0 ? (
                 <div className="py-6 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-neutral-50/50">
                    <p>No active submissions pending municipal review.</p>
                 </div>
              ) : (
                 <div className="space-y-3">
                    {pendingReviews.map(pr => (
                       <div key={pr.id} className="border border-blue-100 bg-blue-50/30 rounded-xl p-4 flex justify-between items-start">
                          <div>
                             <div className="flex items-center gap-2 mb-1">
                                <Clock className="h-4 w-4 text-blue-600" />
                                <h4 className="font-bold text-sm text-neutral-900">{pr.title}</h4>
                             </div>
                             <p className="text-xs text-neutral-600">Submitted: {pr.submittedAt}</p>
                             {pr.documentDetails && <p className="text-xs text-neutral-700 mt-2">{pr.documentDetails}</p>}
                             {pr.feedback && (
                                <p className="text-xs text-neutral-600 italic border-l-2 border-blue-300 pl-2 mt-2">"{pr.feedback}"</p>
                             )}
                          </div>
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                             Pending Review
                          </span>
                       </div>
                    ))}
                 </div>
              )}
           </section>

           {/* D. Contract Documents */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Contract Documents</h3>
              {contract.documentUrl ? (
                 <div className="border border-neutral-200 rounded-xl p-4 bg-white flex items-center gap-3">
                    <div className="bg-neutral-100 p-2 rounded text-neutral-500">
                       <FileText className="h-5 w-5" />
                    </div>
                    <div>
                       <h4 className="font-semibold text-sm text-neutral-900">Contract Agreement Document</h4>
                       <p className="text-[11px] text-neutral-500 uppercase tracking-wide mt-0.5">Internal Record Only</p>
                    </div>
                 </div>
              ) : (
                 <div className="py-6 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-neutral-50/50">
                    <p>No documents currently on file for this contract.</p>
                 </div>
              )}
           </section>

        </div>
      </div>
    </div>
  );
}