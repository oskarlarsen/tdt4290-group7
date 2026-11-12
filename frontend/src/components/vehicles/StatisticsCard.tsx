import type { TripRow } from "../../types/vehicle";
import { DECIMAL_FIELDS, vehicleDate } from "../../utils/vehicle";
import { BODY_TYPES, FUEL_TECHNOLOGIES, VEHICLE_CATEGORIES, catalogLabel } from "../../utils/vehicleCatalog";
import { emissionsNotApplicable } from "../../utils/vehicleCatalog";
import { exactRatio } from "../../utils/deviationAnalysis";

export function StatisticsCard({ row, highlight = false }: { row: TripRow; highlight?: boolean }) {
  const noxRate = exactRatio(row.data.totalNoxRegisteredGrams, row.data.totalKmNoxRegistered, 1000n);
  return <article id={`statistics-${row.id}`} className={`space-y-4 rounded-xl border p-4 ${highlight ? "border-primary-700 bg-primary-50/30" : "border-neutral-200"}`}>
    <h3 className="text-sm font-semibold">Rapporteringsperiode: {vehicleDate(row.data.periodStart)} – {vehicleDate(row.data.periodEnd)}</h3>
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[["Drivstoff", catalogLabel(FUEL_TECHNOLOGIES, row.data.fuelTechnology)], ["Distanse", `${row.data.totalTripKm} km`],
        ["CO₂-utslipp", row.data.co2GramsPerKm == null ? "Ikke relevant" : `${row.data.co2GramsPerKm} g/km`],
        ["Estimert CO₂", row.estimatedCo2Kg == null ? "Ikke relevant" : `${row.estimatedCo2Kg} kg`]].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}
    </dl>
    <details className="border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-sm font-medium">CO₂-beregning</summary>
      <p className="mt-3 text-sm">{row.estimatedCo2Kg == null ? "CO₂ er ikke relevant for denne rapporteringsraden." : `${row.data.totalTripKm} km × ${row.data.co2GramsPerKm} g/km ÷ 1000 = ${row.estimatedCo2Kg} kg (estimert)`}</p>
    </details>
    <details className="border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-sm font-medium">Flere detaljer</summary>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[
        ["Kjøretøytype", catalogLabel(VEHICLE_CATEGORIES, row.data.vehicleCategory)], ["Karosseritype", catalogLabel(BODY_TYPES, row.data.bodyType)],
        ["Merke", row.data.make], ["Modell", row.data.model],
        ["Rapportert NOx-utslipp (mg/km)", emissionsNotApplicable(row.data.fuelTechnology) ? "Ikke relevant" : noxRate ?? "Utilgjengelig"],
        ...DECIMAL_FIELDS.filter(([key]) => !["totalTripKm", "co2GramsPerKm"].includes(key)).map(([key, label]) => [label, row.data[key] ?? "Ikke relevant"]),
        ...(row.data.comment ? [["Kommentar", row.data.comment]] : []),
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 break-words text-sm">{value}</dd></div>)}</dl>
      <details className="mt-4 border-t border-neutral-100 pt-3"><summary className="cursor-pointer text-sm font-medium">NOx-beregning</summary>
        <p className="mt-3 text-sm">{emissionsNotApplicable(row.data.fuelTechnology) ? "NOx er ikke relevant for denne rapporteringsperioden." : noxRate == null
          ? "NOx-utslipp er utilgjengelig: rapportert NOx og en registrert distanse større enn null kreves."
          : `${row.data.totalNoxRegisteredGrams} g × 1 000 ÷ ${row.data.totalKmNoxRegistered} km = ${noxRate} mg/km`}</p>
      </details>
    </details>
  </article>;
}
