import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText, ExternalLink } from "lucide-react";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDate } from "../../utils/formatDate";
import type { ContractStatus } from "../../types/contract";

export default function MyContracts() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { contract } = data;

  const getContractStatusProps = (status: ContractStatus) => {
     switch (status) {
        case "Active": return { status: "tertiary" as const, label: "Active" };
        case "Expiring Soon": return { status: "yellow" as const, label: "Expiring Soon" };
        case "Expired": return { status: "red" as const, label: "Expired" };
        default: return { status: "tertiary" as const, label: status };
     }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Contracts</h1>

      {!contract ? (
         <div className="py-12 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            No active contract registered.
         </div>
      ) : (
        <section className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
          <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                 <FileText className="h-5 w-5" />
               </div>
               <div>
                 <h2 className="font-headline text-lg font-semibold text-neutral-900">{contract.contractName}</h2>
                 <p className="text-sm text-neutral-500">Contract ID: {contract.id}</p>
               </div>
             </div>
             <StatusBadge {...getContractStatusProps(contract.status)} />
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
               <div>
                 <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Start Date</h3>
                 <p className="mt-1 text-sm font-medium text-neutral-900">{formatDate(contract.startDate)}</p>
               </div>
               <div>
                 <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">End Date</h3>
                 <p className="mt-1 text-sm font-medium text-neutral-900">{formatDate(contract.endDate)}</p>
               </div>
            </div>

            <div className="space-y-4">
               <div>
                 <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Contract Document</h3>
                 <div className="mt-1">
                   {contract.documentUrl ? (
                     <a href={contract.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800">
                        <FileText className="h-4 w-4" />
                        View Document
                        <ExternalLink className="h-3 w-3" />
                     </a>
                   ) : (
                     <p className="text-sm text-neutral-500 italic">No document available</p>
                   )}
                 </div>
               </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}