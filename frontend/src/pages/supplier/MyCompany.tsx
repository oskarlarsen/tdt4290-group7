import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2 } from "lucide-react";

export default function MyCompany() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { overview, agreements } = data;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Company</h1>
      <section className="rounded-xl border border-neutral-100 bg-white p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Company Name</h3>
            <p className="mt-1 text-base font-medium text-neutral-900">{overview.supplierName}</p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Organisation Number</h3>
            <p className="mt-1 text-base font-medium text-neutral-900">{overview.orgNumber}</p>
          </div>
          <div>
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Primary Contract</h3>
            <p className="mt-1 text-base font-medium text-neutral-900">{agreements.length ? `${agreements.length} agreement${agreements.length === 1 ? "" : "s"}` : "No agreement registered"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}