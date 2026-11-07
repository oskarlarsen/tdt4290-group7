import { useState, useMemo } from "react";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText, CheckCircle2, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import { PageHeader } from "../../components/ui/PageHeader";
import type { Certificate } from "../../types/certificate";
import { CertificateDetailsModal } from "../../components/supplier/CertificateDetailsModal";
import { CERTIFICATE_STANDARD_LABELS } from "../../types/certificate";

type FilterType = "All" | "Valid" | "Expiring Soon" | "Expired";

export default function MyCertificates() {
  const { data, isLoading, isError, error } = useMySupplierOverview();
  const [filterType, setFilterType] = useState<FilterType>("All");
  const [selectedCertId, setSelectedCertId] = useState<string | null>(null);

  const raw = data?.raw;
  const contracts = data?.contracts || [];
  const pendingReviews = data?.pendingReviews || [];

  const now = useMemo(() => new Date(), []);

  // Helper to determine actual status
  const getCertStatus = (cert: Certificate) => {
     if (!cert.validUntil) return { label: "Unknown", type: "Unknown", className: "bg-neutral-100 text-neutral-600 border-neutral-200" };
     const validUntilDate = new Date(cert.validUntil);
     const daysUntilExpiry = Math.ceil((validUntilDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

     if (daysUntilExpiry < 0) return { label: "Expired", type: "Expired", className: "bg-red-50 text-red-700 border-red-200" };
     if (daysUntilExpiry <= 90) return { label: "Expiring Soon", type: "Expiring Soon", className: "bg-amber-50 text-amber-700 border-amber-200" };
     return { label: "Valid", type: "Valid", className: "bg-teal-50 text-teal-700 border-teal-200" };
  };

  const getContractName = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    return contract ? contract.contractName : "Unknown Contract";
  };

  // Only display actual certificates (must have validUntil or a certificateNumber)
  const actualCertificates = useMemo(() => {
     return (raw?.certificates || []).filter(c => c.validUntil !== null || c.certificateNumber !== null);
  }, [raw]);

  const filteredAndSortedCerts = useMemo(() => {
    let result = [...actualCertificates];

    if (filterType !== "All") {
       result = result.filter(c => {
          if (!c.validUntil) return false;
          return getCertStatus(c).type === filterType;
       });
    }

    result.sort((a, b) => {
       if (!a.validUntil) return 1;
       if (!b.validUntil) return -1;

       const aStatus = getCertStatus(a).type;
       const bStatus = getCertStatus(b).type;

       const urgency: Record<string, number> = {
          "Expired": 1,
          "Expiring Soon": 2,
          "Valid": 3,
          "Unknown": 4
       };

       if (urgency[aStatus] !== urgency[bStatus]) {
           return urgency[aStatus] - urgency[bStatus];
       }

       return new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime();
    });

    return result;
  }, [actualCertificates, filterType, now]);

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const selectedCert = actualCertificates.find(c => c.id === selectedCertId) || null;
  const relatedContractName = selectedCert ? getContractName(selectedCert.contractId) : null;

  // Refined mapping logic based on mock data structure
  const reviewRecord = selectedCert ? pendingReviews.find(pr => {
      const standardLabel = CERTIFICATE_STANDARD_LABELS[selectedCert.standard];
      return pr.title.includes(standardLabel) || (pr.documentDetails && pr.documentDetails.includes(standardLabel));
  }) : null;

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Certificates Directory"
        description="View and manage your active environmental documentation."
      />

      <div className="bg-white rounded-xl shadow-sm border border-neutral-100 p-4">
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar w-full">
          {(["All", "Valid", "Expiring Soon", "Expired"] as FilterType[]).map(ft => (
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
         {filteredAndSortedCerts.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 flex flex-col items-center">
               <FileText className="h-6 w-6 text-neutral-300 mb-2" />
               <p>No active certificates found.</p>
            </div>
         ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                   <thead className="bg-neutral-50 border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                      <tr>
                         <th className="px-6 py-4">Certificate Name</th>
                         <th className="px-6 py-4">Certificate Number</th>
                         <th className="px-6 py-4">Issuer</th>
                         <th className="px-6 py-4">Valid Until</th>
                         <th className="px-6 py-4">Status</th>
                         <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-neutral-100">
                      {filteredAndSortedCerts.map((cert) => {
                         const status = cert.validUntil ? getCertStatus(cert) : { label: "Unknown", type: "Unknown", className: "bg-neutral-100 text-neutral-600 border-neutral-200" };

                         return (
                            <tr key={cert.id} className="hover:bg-neutral-50 transition-colors">
                               <td className="px-6 py-4">
                                  <div className="font-bold text-neutral-900 uppercase tracking-wide text-xs">
                                     {CERTIFICATE_STANDARD_LABELS[cert.standard] || cert.standard.replace(/-/g, ' ')}
                                  </div>
                               </td>
                               <td className="px-6 py-4 font-mono text-xs text-neutral-500">
                                  {cert.certificateNumber || "—"}
                               </td>
                               <td className="px-6 py-4 text-neutral-600 text-xs">
                                  {cert.supplierName || "—"}
                               </td>
                               <td className="px-6 py-4 text-neutral-600 text-xs whitespace-nowrap">
                                  {cert.validUntil ? formatDate(cert.validUntil) : "—"}
                               </td>
                               <td className="px-6 py-4">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border uppercase tracking-wide ${status.className}`}>
                                     {status.type === "Expired" || status.type === "Expiring Soon" ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                     {status.label}
                                  </span>
                               </td>
                               <td className="px-6 py-4 text-right">
                                  <button
                                     onClick={() => setSelectedCertId(cert.id)}
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

      <CertificateDetailsModal
         isOpen={!!selectedCertId}
         onClose={() => setSelectedCertId(null)}
         certificate={selectedCert}
         contractName={relatedContractName}
         pendingReview={reviewRecord}
      />
    </div>
  );
}