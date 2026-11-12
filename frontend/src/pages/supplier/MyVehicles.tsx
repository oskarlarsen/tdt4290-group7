import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Link } from "react-router-dom";
import { Loader2, Truck } from "lucide-react";
import { FUEL_TECHNOLOGIES, vehicleWeightRange } from "../../utils/vehicleCatalog";

export default function MyVehicles() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Kunne ikke laste data"}</div>;

  const myVehicles = data.vehicles;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">Mine kjøretøy</h1>
        <Link
          to="/supplier/onboarding?entity=vehicles"
          className="inline-flex h-9 items-center rounded-lg bg-primary-900 px-3 text-sm font-medium text-white hover:bg-primary-700"
        >
          Legg til eller oppdater kjøretøy
        </Link>
      </div>

      {myVehicles.length === 0 ? (
         <div className="py-12 flex flex-col items-center justify-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            <Truck className="h-8 w-8 text-neutral-300 mb-3" />
            <p>Ingen kjøretøy er knyttet til organisasjonen din.</p>
         </div>
      ) : (
         <section className="rounded-xl border border-neutral-100 bg-white p-6">
           <p className="text-sm text-neutral-600 mb-4">
              Du har {myVehicles.filter((vehicle) => vehicle.listed).length} kjøretøy på listen.
          </p>
          <div className="overflow-x-auto border border-neutral-100 rounded-lg">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th scope="col" className="px-4 py-3">Registreringsnummer</th>
                  <th scope="col" className="px-4 py-3">Drivstoff eller framdrift</th>
                  <th scope="col" className="px-4 py-3">Vekt</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                 {myVehicles.map((vehicle) => (
                   <tr key={vehicle.registrationNumber} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-mono font-medium text-neutral-900">
                        {vehicle.planned ? "Registrering venter" : vehicle.registrationNumber}
                    </td>
                    <td className="px-4 py-3">
                        {vehicle.fuelTechnology ? (FUEL_TECHNOLOGIES as Record<string, string>)[vehicle.fuelTechnology] ?? vehicle.fuelTechnology : "—"}
                    </td>
                    <td className="px-4 py-3">{vehicleWeightRange(vehicle.vehicleCategory) ?? "—"}</td>
                    <td className="px-4 py-3">
                         <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${vehicle.listed ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>{vehicle.listed ? "På listen din" : "Fjernet"}</span>
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