import { useState, useMemo } from "react";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText, AlertTriangle, Clock, CheckCircle2, ChevronRight } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import { PageHeader } from "../../components/ui/PageHeader";
import type { ContractOverview } from "../../utils/supplierOverview";
import { ContractDetailsModal } from "../../components/supplier/ContractDetailsModal";

export default function MyContracts() {
  const { data, isLoading, isError, error } = useMySupplierOverview();
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const contractOverviews = data?.contractOverviews || [];

  const getContractActionStatus = (co: ContractOverview) => {
      if (co.requiredActions.length > 0) return "Needs Attention";
      if (co.pendingReviews.length > 0) return "Pending Review";
      return "Up to Date";
  };

  const sortedContracts = useMemo(() => {
    let result = [...contractOverviews];

    result.sort((a, b) => {
        const aStatus = getContractActionStatus(a);
        const bStatus = getContractActionStatus(b);

        const urgency = {
            "Needs Attention": 1,
            "Pending Review": 2,
            "Up to Date": 3
        };

        if (urgency[aStatus] !== urgency[bStatus]) {
            return urgency[aStatus] - urgency[bStatus];
        }
        return a.contract.contractName.localeCompare(b.contract.contractName);
    });

    return result;
  }, [contractOverviews]);

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const selectedOverview = contractOverviews.find(co => co.contract.id === selectedContractId) || null;

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="My Contracts"
        description="View your active municipal contracts, compliance status, and historical submissions."
      />

      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
         {sortedContracts.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-500 flex flex-col items-center">
               <FileText className="h-6 w-6 text-neutral-300 mb-2" />
               <p>No active contracts found.</p>
            </div>
         ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                   <thead className="bg-neutral-50 border-b border-neutral-200 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                      <tr>
                         <th className="px-6 py-4">Contract Name</th>
                         <th className="px-6 py-4">Reference</th>
                         <th className="px-6 py-4">Valid Period</th>
                         <th className="px-6 py-4">Status</th>
                         <th className="px-6 py-4 text-right">Action</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-neutral-100">
                      {sortedContracts.map((co) => {
                         const status = getContractActionStatus(co);
                         return (
                            <tr key={co.contract.id} className="hover:bg-neutral-50 transition-colors">
                               <td className="px-6 py-4">
                                  <div className="font-bold text-neutral-900">{co.contract.contractName}</div>
                               </td>
                               <td className="px-6 py-4 font-mono text-xs text-neutral-500">
                                  {co.contract.id}
                               </td>
                               <td className="px-6 py-4 text-neutral-600 text-xs whitespace-nowrap">
                                  {formatDate(co.contract.startDate)} - {formatDate(co.contract.endDate)}
                               </td>
                               <td className="px-6 py-4">
                                  {status === "Needs Attention" && (
                                     <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-700 border border-red-200 uppercase tracking-wide">
                                        <AlertTriangle className="h-3 w-3" /> Needs Attention
                                     </span>
                                  )}
                                  {status === "Pending Review" && (
                                     <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 uppercase tracking-wide">
                                        <Clock className="h-3 w-3" /> Pending Review
                                     </span>
                                  )}
                                  {status === "Up to Date" && (
                                     <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200 uppercase tracking-wide">
                                        <CheckCircle2 className="h-3 w-3" /> Up to Date
                                     </span>
                                  )}
                               </td>
                               <td className="px-6 py-4 text-right">
                                  <button
                                     onClick={() => setSelectedContractId(co.contract.id)}
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

      <ContractDetailsModal
         isOpen={!!selectedContractId}
         onClose={() => setSelectedContractId(null)}
         overview={selectedOverview}
      />
    </div>
  );
}