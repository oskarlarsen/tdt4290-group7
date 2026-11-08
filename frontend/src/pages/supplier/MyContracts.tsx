import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText } from "lucide-react";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDate } from "../../utils/formatDate";
import { agreementLabel } from "../../utils/agreementLabel";

export default function MyContracts() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { agreements } = data;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Contracts</h1>

      {agreements.length === 0 ? (
         <div className="py-12 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            No agreement records are linked to your organization.
         </div>
       ) : (
         <div className="space-y-4">
         {agreements.map((agreement) => {
           const today = new Date().toISOString().slice(0, 10);
           const status = agreement.endDate < today
             ? { status: "red" as const, label: "Expired" }
             : agreement.startDate > today
               ? { status: "yellow" as const, label: "Upcoming" }
               : agreement.active
                 ? { status: "tertiary" as const, label: "Active" }
                 : { status: "orange" as const, label: "Inactive" };
           return <section key={agreement.id} className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
           <div className="border-b border-neutral-100 bg-neutral-50 px-6 py-4 flex items-center justify-between">
             <div className="flex items-center gap-3">
               <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                 <FileText className="h-5 w-5" />
               </div>
               <div>
                  <h2 className="font-headline text-lg font-semibold text-neutral-900">{agreementLabel(agreement)}</h2>
                  <p className="text-sm text-neutral-500">Agreement ID: {agreement.id}</p>
                </div>
              </div>
              <StatusBadge status={status.status} label={status.label} />
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
               <div>
                 <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Start Date</h3>
                  <p className="mt-1 text-sm font-medium text-neutral-900">{formatDate(agreement.startDate)}</p>
               </div>
               <div>
                 <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">End Date</h3>
                  <p className="mt-1 text-sm font-medium text-neutral-900">{formatDate(agreement.endDate)}</p>
               </div>
            </div>

            <div className="space-y-4">
               <div>
                  <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Vehicle allowance</h3>
                  <p className="mt-1 text-sm font-medium text-neutral-900">{agreement.activeVehiclesCount} / {agreement.allowedVehicles} vehicles</p>
                </div>
            </div>
          </div>
         </section>;
         })}
         </div>
      )}
    </div>
  );
}