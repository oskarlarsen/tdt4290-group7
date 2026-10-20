import type { TripRow } from "../../types/vehicle";
import { DECIMAL_FIELDS, vehicleDate } from "../../utils/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../../utils/vehicleCatalog";

export function StatisticsCard({ row, highlight = false }: { row: TripRow; highlight?: boolean }) {
  return <article id={`statistics-${row.id}`} className={`space-y-4 rounded-xl border p-4 ${highlight ? "border-primary-700 bg-primary-50/30" : "border-neutral-200"}`}>
    <h3 className="text-sm font-semibold">Reporting period: {vehicleDate(row.data.periodStart)} – {vehicleDate(row.data.periodEnd)}</h3>
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[["Fuel", catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology)], ["Distance", `${row.data.totalTripKm} km`],
        ["CO₂ rate", row.data.co2GramsPerKm == null ? "Not applicable" : `${row.data.co2GramsPerKm} g/km`],
        ["Estimated CO₂", row.estimatedCo2Kg == null ? "Not applicable" : `${row.estimatedCo2Kg} kg`]].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}
    </dl>
    <details className="border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-sm font-medium">CO₂ calculation</summary>
      <p className="mt-3 text-sm">{row.estimatedCo2Kg == null ? "CO₂ is not applicable for this reporting row." : `${row.data.totalTripKm} km × ${row.data.co2GramsPerKm} g/km ÷ 1000 = ${row.estimatedCo2Kg} kg (estimated)`}</p>
    </details>
    <details className="border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-sm font-medium">Vehicle and NOx details</summary>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[
        ["Vehicle type", catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory)], ["Body type", catalogLabel(BODY_TYPES, row.data.bodyType)],
        ["Brand", row.data.make], ["Model", row.data.model], ["Jobs/trips", row.data.tripCount],
        ...DECIMAL_FIELDS.filter(([key]) => !["totalTripKm", "co2GramsPerKm"].includes(key)).map(([key, label]) => [label, row.data[key] ?? "Not applicable"]),
        ...(row.data.comment ? [["Comment", row.data.comment]] : []),
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
    </details>
  </article>;
}
