import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Truck } from "lucide-react";
import type { Vehicle } from "../../types/vehicle";

export default function MyVehicles() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { summaries, raw } = data;
  const vState = summaries.vehicles.state;

  // We use contract.id (or contract.supplierId) which is the same supplierId we used to filter in buildSupplierOverview
  const supplierId = data.contract?.supplierId || data.supplier?.orgId; // Fallback

  let myVehicles: Vehicle[] = [];
  if (raw.vehicles && supplierId) {
     // match the logic from buildSupplierOverview
     const myAgreement = raw.vehicles.agreements.find(a => a.supplierId === supplierId || a.supplierId === "sup-c");
     if (myAgreement) {
         myVehicles = raw.vehicles.vehicles.filter(v => v.agreementId === myAgreement.id);
     }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Vehicles</h1>

      {vState === "not-applicable" ? (
         <div className="py-12 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            Vehicle reporting is not applicable to your contract.
         </div>
      ) : vState === "data-missing" ? (
         <div className="py-12 flex flex-col items-center justify-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            <Truck className="h-8 w-8 text-neutral-300 mb-3" />
            <p>No vehicle data submitted.</p>
         </div>
      ) : (
        <section className="rounded-xl border border-neutral-100 bg-white p-6">
          <p className="text-sm text-neutral-600 mb-4">
             You have {summaries.vehicles.tracked} tracked vehicles.
          </p>
          <div className="overflow-x-auto border border-neutral-100 rounded-lg">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">Registration Number</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {myVehicles.map((vehicle, idx) => (
                  <tr key={vehicle.registrationNumber || idx} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-mono font-medium text-neutral-900">
                       {vehicle.registrationNumber || "Unregistered (Planned)"}
                    </td>
                    <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Tracked</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}