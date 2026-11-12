import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, Truck } from "lucide-react";
import { FUEL_TECHNOLOGIES, vehicleWeightRange } from "../../utils/vehicleCatalog";

export default function MyVehicles() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const approved = data.vehicles.filter((vehicle) => vehicle.listed);
  const uploaded = data.vehicles.filter((vehicle) => vehicle.uploaded);
  // A truck can be under several agreements, so a listing is the plate together with its agreement.
  const listingKey = (vehicle: { registrationNumber: string; agreementId: string | null }) => `${vehicle.registrationNumber}|${vehicle.agreementId}`;
  const approvedListings = new Set(approved.map(listingKey));

  function table(rows: typeof approved, showApproval: boolean) {
    return (
      <div className="overflow-x-auto border border-neutral-100 rounded-lg">
        <table className="w-full text-left text-sm text-neutral-600">
          <thead className="bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500 border-b border-neutral-100">
            <tr>
              <th scope="col" className="px-4 py-3">Registration Number</th>
              <th scope="col" className="px-4 py-3">Fuel or propulsion</th>
              <th scope="col" className="px-4 py-3">Weight</th>
              {showApproval && <th scope="col" className="px-4 py-3">Approved list</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((vehicle) => (
              <tr key={listingKey(vehicle)} className="hover:bg-neutral-50/50">
                <td className="px-4 py-3 font-mono font-medium text-neutral-900">{vehicle.planned ? "Registration pending" : vehicle.registrationNumber}</td>
                <td className="px-4 py-3">{vehicle.fuelTechnology ? (FUEL_TECHNOLOGIES as Record<string, string>)[vehicle.fuelTechnology] ?? vehicle.fuelTechnology : "—"}</td>
                <td className="px-4 py-3">{vehicleWeightRange(vehicle.vehicleCategory) ?? "—"}</td>
                {showApproval && <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${approvedListings.has(listingKey(vehicle)) || vehicle.exceptionApproved ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {approvedListings.has(listingKey(vehicle)) ? "On the list" : vehicle.exceptionApproved ? "Approved as an exception" : "Not on the list: deviation"}
                  </span>
                  {vehicle.registryProblem === "NOT_FOUND" && <p role="alert" className="mt-1 text-xs font-medium text-red-700">Plate not found in Statens vegvesen. Check that the registration number you reported is correct.</p>}
                  {vehicle.exceptionApproved && vehicle.exceptionNote && !approvedListings.has(listingKey(vehicle)) && <p className="mt-1 text-xs text-neutral-600">Note from the administrator: {vehicle.exceptionNote}</p>}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const empty = (text: string) => (
    <div className="py-12 flex flex-col items-center justify-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
      <Truck className="h-8 w-8 text-neutral-300 mb-3" />
      <p>{text}</p>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Vehicles</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">Approved vehicles</h2>
        <p className="text-sm text-neutral-600">The list you and the contract manager agreed on. {approved.length} vehicle(s).</p>
        {approved.length ? table(approved, false) : empty("No approved vehicles have been added for your organization yet.")}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-neutral-900">Vehicles you have reported</h2>
        <p className="text-sm text-neutral-600">The vehicles you have actually used. Any that are not on the approved list are checked with Statens vegvesen. {uploaded.length} vehicle(s).</p>
        {uploaded.some((vehicle) => vehicle.registryProblem === "UNAVAILABLE") && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Statens vegvesen was unavailable, so some of your vehicles have not been checked yet.</p>}
        {data.agreements.filter((a) => uploaded.filter((v) => v.agreementId === a.id).length > a.allowedVehicles).map((a) => (
          <p key={a.id} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            You have reported {uploaded.filter((v) => v.agreementId === a.id).length} vehicles on agreement {a.saksnr ?? a.id}, over the maximum of {a.allowedVehicles}. The administrator needs to approve the extra vehicles.
          </p>
        ))}
        {uploaded.length ? table(uploaded, true) : empty("You have not reported any vehicles yet.")}
      </section>
    </div>
  );
}
