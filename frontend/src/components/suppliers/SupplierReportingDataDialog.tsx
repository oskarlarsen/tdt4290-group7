import { useQuery } from "@tanstack/react-query";
import {
  getOnboardingStatus,
  getSupplierEnergy,
  getSupplierProducts,
  getSupplierVehicles,
} from "../../api/onboarding";
import { ApiError } from "../../api/client";
import { ErrorNotice, VehicleDialog, buttonClass } from "../vehicles/VehicleDialog";
import { FUEL_TECHNOLOGIES } from "../../utils/vehicleCatalog";
import { ECOLABEL_STANDARDS, PRODUCT_CATEGORIES, UNITS_OF_MEASURE } from "../../utils/productFormCsv";
import { formatNumber } from "../../utils/formatNumber";

type Props = {
  supplier: { id: string; name: string };
  onClose: () => void;
};

export function SupplierReportingDataDialog({ supplier, onClose }: Props) {
  const query = useQuery({
    queryKey: ["admin-supplier-data", supplier.id],
    queryFn: async () => {
      const [status, vehicles, energy, products] = await Promise.all([
        getOnboardingStatus(supplier.id),
        getSupplierVehicles(supplier.id),
        getSupplierEnergy(supplier.id),
        getSupplierProducts(supplier.id),
      ]);
      return { status, vehicles, energy, products };
    },
    retry: false,
  });

  return (
    <VehicleDialog title={`Innsendt informasjon · ${supplier.name}`} onClose={onClose}>
      {query.isLoading && <p role="status" className="text-sm text-neutral-500">Laster innsendt informasjon…</p>}
      {query.isError && <ErrorNotice error={query.error instanceof ApiError && query.error.status >= 500 ? new Error("Innsendt informasjon kunne ikke lastes. Denne leverandøren kan være demodata uten registreringspost.") : query.error} />}
      {query.data && (
        <div className="space-y-4">
          {query.data.status.requiredEntities.map((entity) => (
            <section key={entity} className="rounded-lg border border-neutral-200 p-3">
              <h3 className="text-sm font-semibold text-neutral-800">
                {entity === "VEHICLES" ? "Kjøretøy" : entity === "ENERGY" ? "Energi" : "Produkter"}
              </h3>
              {entity === "VEHICLES" && (
                query.data.vehicles.length
                  ? <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                    {query.data.vehicles.map((vehicle) => {
                      const fuel = vehicle.fuelTechnology
                        ? ((FUEL_TECHNOLOGIES as Record<string, string>)[vehicle.fuelTechnology] ?? vehicle.fuelTechnology)
                        : "—";
                      const coverage = vehicle.fullContractCoverage === null
                        ? "—"
                        : vehicle.fullContractCoverage
                          ? "Hele avtaleperioden"
                          : `${vehicle.startYearWeek ?? "?"} til ${vehicle.endYearWeek ?? "?"}`;
                      return (
                        <li key={`${vehicle.registrationNumber}|${vehicle.agreementId}`}>
                          <span className="font-medium text-neutral-800">
                            {vehicle.planned ? "Planlagt kjøretøy" : vehicle.registrationNumber}
                          </span>
                          {" · Drivstoff: "}{fuel}
                          {" · Hybrid: "}{vehicle.isHybrid === null ? "—" : vehicle.isHybrid ? "Ja" : "Nei"}
                          {" · Dekning: "}{coverage}
                          {vehicle.attachmentReference ? ` · Dok.: ${vehicle.attachmentReference}` : ""}
                          {vehicle.notes ? ` · Notat: ${vehicle.notes}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                  : <p className="mt-1 text-sm text-neutral-500">Ingen kjøretøy er sendt inn ennå.</p>
              )}
              {entity === "ENERGY" && (
                query.data.energy.length
                  ? <ul className="mt-2 space-y-2 text-sm text-neutral-600">
                    {[...query.data.energy].sort((a, b) => b.reportingYear - a.reportingYear || b.reportingQuarter - a.reportingQuarter || a.locationCode.localeCompare(b.locationCode)).map((record) => (
                      <li key={record.id} className="rounded-md bg-neutral-50 p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-neutral-800">{record.locationCode}</span>
                          <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">{record.reportingYear} Q{record.reportingQuarter}</span>
                        </div>
                        <p className="text-xs text-neutral-500">{record.address}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-neutral-500">Strøm:</span> <span className="font-medium">{formatNumber(record.electricityKwh)} kWh</span></div>
                          <div><span className="text-neutral-500">Fjernvarme:</span> <span className="font-medium">{formatNumber(record.districtHeatingKwh)} kWh</span></div>
                          {record.biogasKwh > 0 && <div><span className="text-neutral-500">Biogass:</span> <span className="font-medium">{formatNumber(record.biogasKwh)} kWh</span></div>}
                          {record.fossilFuelKwh > 0 && <div><span className="text-neutral-500">Fossilt brensel:</span> <span className="font-medium">{formatNumber(record.fossilFuelKwh)} kWh</span></div>}
                          {record.selfProducedSolarKwh > 0 && <div><span className="text-neutral-500">Sol:</span> <span className="font-medium">{formatNumber(record.selfProducedSolarKwh)} kWh</span></div>}
                          {record.selfProducedHeatpumpKwh > 0 && <div><span className="text-neutral-500">Varmepumpe:</span> <span className="font-medium">{formatNumber(record.selfProducedHeatpumpKwh)} kWh</span></div>}
                          {record.gooCoveredKwh > 0 && <div><span className="text-neutral-500">Opprinnelsesgarantier:</span> <span className="font-medium">{formatNumber(record.gooCoveredKwh)} kWh</span></div>}
                        </div>
                        {(record.storageAreaSqm || record.workshopAreaSqm || record.otherAreaSqm) && (
                          <p className="mt-1 text-xs text-neutral-500">
                            Areal: {[
                              record.storageAreaSqm ? `Lager: ${record.storageAreaSqm} m²` : null,
                              record.workshopAreaSqm ? `Verksted: ${record.workshopAreaSqm} m²` : null,
                              record.otherAreaSqm ? `Annet: ${record.otherAreaSqm} m²` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {record.notes ? <p className="mt-1 text-xs italic text-neutral-500">{record.notes}</p> : null}
                      </li>
                    ))}
                  </ul>
                  : <p className="mt-1 text-sm text-neutral-500">Ingen energirapporter er sendt inn ennå.</p>
              )}
              {entity === "PRODUCTS" && (
                query.data.products.length
                  ? <ul className="mt-2 space-y-2 text-sm text-neutral-600">
                    {query.data.products.map((product) => {
                      const category = PRODUCT_CATEGORIES[product.productCategory] ?? product.productCategory;
                      const ecolabel = product.ecolabelStandard === "NONE"
                        ? "Ingen"
                        : (ECOLABEL_STANDARDS[product.ecolabelStandard] ?? product.ecolabelStandard);
                      const unit = UNITS_OF_MEASURE[product.unitOfMeasure] ?? product.unitOfMeasure;
                      return (
                        <li key={product.id} className="rounded-md bg-neutral-50 p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-neutral-800">{product.productName}</span>
                            <span className="font-mono text-xs text-neutral-500">{product.productCode}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span><strong className="font-medium text-neutral-700">Kategori:</strong> {category}</span>
                            <span><strong className="font-medium text-neutral-700">Miljømerke:</strong> {ecolabel}{product.licenseNumber ? ` (#${product.licenseNumber})` : ""}</span>
                            <span><strong className="font-medium text-neutral-700">Enhet:</strong> {unit}</span>
                            <span><strong className="font-medium text-neutral-700">Sirkulær/gjenbrukt:</strong> {product.isRepairedOrReused ? "Ja" : "Nei"}</span>
                          </div>
                          {product.notes ? <p className="mt-1 text-xs italic text-neutral-500">{product.notes}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                  : <p className="mt-1 text-sm text-neutral-500">Ingen produkter er sendt inn ennå.</p>
              )}
            </section>
          ))}
          {query.data.status.requiredEntities.length === 0 && (
            <p className="text-sm text-neutral-500">Ingen informasjonskategorier er etterspurt.</p>
          )}
        </div>
      )}
      <footer className="mt-4 flex justify-end border-t border-neutral-100 pt-4"><button type="button" className={buttonClass} onClick={onClose}>Lukk</button></footer>
    </VehicleDialog>
  );
}
