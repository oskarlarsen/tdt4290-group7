import { X, FileText, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import type { Certificate } from "../../types/certificate";
import { CERTIFICATE_STANDARD_LABELS } from "../../types/certificate";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  certificate: Certificate | null;
  contractName: string | null;
  pendingReview?: any;
}

export function CertificateDetailsModal({ isOpen, onClose, certificate, contractName, pendingReview }: Props) {
  if (!isOpen || !certificate) return null;

  const now = new Date();

  const getValidityStatus = () => {
     if (!certificate.validUntil) return { label: "Unknown", className: "bg-neutral-100 text-neutral-600 border-neutral-200" };

     const validUntilDate = new Date(certificate.validUntil);
     const daysUntilExpiry = Math.ceil((validUntilDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

     if (daysUntilExpiry < 0) return { label: "Expired", className: "bg-red-50 text-red-700 border-red-200" };
     if (daysUntilExpiry <= 90) return { label: "Expiring Soon", className: "bg-amber-50 text-amber-700 border-amber-200" };
     return { label: "Valid", className: "bg-teal-50 text-teal-700 border-teal-200" };
  };

  const validityStatus = getValidityStatus();

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
                 <FileText className="h-5 w-5" />
              </div>
              <div>
                 <h2 className="font-headline text-lg font-bold text-neutral-900 uppercase tracking-wide">
                    {CERTIFICATE_STANDARD_LABELS[certificate.standard] || certificate.standard.replace(/-/g, ' ')}
                 </h2>
                 <p className="text-[11px] text-neutral-500 font-medium uppercase tracking-wide">
                    Certificate Details
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
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Certificate Number</p>
                      <p className="text-sm font-medium text-neutral-900 font-mono mt-0.5">{certificate.certificateNumber || "—"}</p>
                  </div>
                  <div className="bg-neutral-50/50 rounded-lg p-3 border border-neutral-100">
                      <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Issuer</p>
                      <p className="text-sm font-medium text-neutral-900 mt-0.5">{certificate.supplierName || "—"}</p>
                  </div>
              </div>
           </section>

           {/* Validity & Status */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Validity & Status</h3>
              <div className="border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row gap-6 justify-between bg-white items-start sm:items-center mb-4">
                  <div className="flex gap-8">
                      <div>
                          <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Issue Date</p>
                          <p className="text-sm font-medium text-neutral-900 mt-0.5">{certificate.issueDate ? formatDate(certificate.issueDate) : "—"}</p>
                      </div>
                      <div>
                          <p className="text-[10px] uppercase text-neutral-400 font-semibold tracking-wide">Valid Until</p>
                          <p className="text-sm font-medium text-neutral-900 mt-0.5">{certificate.validUntil ? formatDate(certificate.validUntil) : "—"}</p>
                      </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${validityStatus.className}`}>
                      {validityStatus.label === "Valid" ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {validityStatus.label}
                  </span>
              </div>

              {pendingReview && (
                 <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 flex justify-between items-center">
                    <div>
                        <p className="text-[10px] uppercase text-blue-800/70 font-semibold tracking-wide mb-1">Municipal Review Status</p>
                        <h4 className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                           <Clock className="w-4 h-4 text-blue-600" /> Pending Review
                        </h4>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-neutral-600">Submitted: {pendingReview.submittedAt}</p>
                    </div>
                 </div>
              )}
           </section>

           {/* Relationships & Documents */}
           <section>
              <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase mb-4">Relationships & Documents</h3>
              <div className="space-y-3">
                 {contractName && (
                     <div className="border border-neutral-200 rounded-xl p-4 bg-white flex justify-between items-center">
                        <div>
                           <h4 className="font-semibold text-sm text-neutral-900">Associated Contract</h4>
                           <p className="text-xs text-neutral-600 mt-0.5">{contractName}</p>
                        </div>
                     </div>
                 )}

                 {certificate.sourceFile && (
                    <div className="border border-neutral-200 rounded-xl p-4 bg-white flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="bg-neutral-100 p-2 rounded text-neutral-500">
                             <FileText className="h-5 w-5" />
                          </div>
                          <div>
                             <h4 className="font-semibold text-sm text-neutral-900">Source Document</h4>
                             <p className="text-[11px] text-neutral-500 font-mono mt-0.5">{certificate.sourceFile}</p>
                          </div>
                       </div>
                    </div>
                 )}

                 {!certificate.sourceFile && !contractName && (
                    <div className="py-4 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-neutral-50/50">
                       <p>No additional associations or documents on file.</p>
                    </div>
                 )}
              </div>
           </section>

        </div>
      </div>
    </div>
  );
}