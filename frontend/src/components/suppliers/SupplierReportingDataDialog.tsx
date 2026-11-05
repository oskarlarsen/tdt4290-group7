import { useQuery } from "@tanstack/react-query";
import {
  getOnboardingStatus,
  getSupplierEnergy,
  getSupplierProducts,
  getSupplierVehicles,
} from "../../api/onboarding";
import { ErrorNotice, VehicleDialog } from "../vehicles/VehicleDialog";
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
    <VehicleDialog title={`Submitted information · ${supplier.name}`} onClose={onClose}>
      {query.isLoading && <p role="status" className="text-sm text-neutral-500">Loading submitted information…</p>}
      {query.isError && <ErrorNotice error={query.error} />}
      {query.data && (
        <div className="space-y-4">
          {query.data.status.requiredEntities.map((entity) => (
            <section key={entity} className="rounded-lg border border-neutral-200 p-3">
              <h3 className="text-sm font-semibold text-neutral-800">
                {entity === "VEHICLES" ? "Vehicles" : entity === "ENERGY" ? "Energy" : "Products"}
              </h3>
              {entity === "VEHICLES" && (
                query.data.vehicles.length
                  ? <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                    {query.data.vehicles.map((vehicle) => {
                      const fuel = vehicle.fuelTechnology
                        ? (FUEL_TECHNOLOGIES[vehicle.fuelTechnology] ?? vehicle.fuelTechnology)
                        : "—";
                      const coverage = vehicle.fullContractCoverage === null
                        ? "—"
                        : vehicle.fullContractCoverage
                          ? "Full agreement period"
                          : `${vehicle.startYearWeek ?? "?"} to ${vehicle.endYearWeek ?? "?"}`;
                      return (
                        <li key={vehicle.registrationNumber}>
                          <span className="font-medium text-neutral-800">
                            {vehicle.planned ? "Planned vehicle" : vehicle.registrationNumber}
                          </span>
                          {" · Fuel: "}{fuel}
                          {" · Hybrid: "}{vehicle.isHybrid === null ? "—" : vehicle.isHybrid ? "Yes" : "No"}
                          {" · Coverage: "}{coverage}
                          {vehicle.attachmentReference ? ` · Doc: ${vehicle.attachmentReference}` : ""}
                          {vehicle.notes ? ` · Note: ${vehicle.notes}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                  : <p className="mt-1 text-sm text-neutral-500">No vehicle entries submitted yet.</p>
              )}
              {entity === "ENERGY" && (
                query.data.energy.length
                  ? <ul className="mt-2 space-y-2 text-sm text-neutral-600">
                    {query.data.energy.map((record) => (
                      <li key={record.id} className="rounded-md bg-neutral-50 p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-neutral-800">{record.locationCode}</span>
                          <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">Year {record.reportingYear}</span>
                        </div>
                        <p className="text-xs text-neutral-500">{record.address}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-neutral-500">Electricity:</span> <span className="font-medium">{formatNumber(record.electricityKwh)} kWh</span></div>
                          <div><span className="text-neutral-500">District heating:</span> <span className="font-medium">{formatNumber(record.districtHeatingKwh)} kWh</span></div>
                          {record.biogasKwh > 0 && <div><span className="text-neutral-500">Biogas:</span> <span className="font-medium">{formatNumber(record.biogasKwh)} kWh</span></div>}
                          {record.fossilFuelKwh > 0 && <div><span className="text-neutral-500">Fossil fuel:</span> <span className="font-medium">{formatNumber(record.fossilFuelKwh)} kWh</span></div>}
                          {record.selfProducedSolarKwh > 0 && <div><span className="text-neutral-500">Solar:</span> <span className="font-medium">{formatNumber(record.selfProducedSolarKwh)} kWh</span></div>}
                          {record.selfProducedHeatpumpKwh > 0 && <div><span className="text-neutral-500">Heat pump:</span> <span className="font-medium">{formatNumber(record.selfProducedHeatpumpKwh)} kWh</span></div>}
                        </div>
                        {(record.storageAreaSqm || record.workshopAreaSqm || record.otherAreaSqm) && (
                          <p className="mt-1 text-xs text-neutral-500">
                            Areas: {[
                              record.storageAreaSqm ? `Storage: ${record.storageAreaSqm} m²` : null,
                              record.workshopAreaSqm ? `Workshop: ${record.workshopAreaSqm} m²` : null,
                              record.otherAreaSqm ? `Other: ${record.otherAreaSqm} m²` : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {record.notes ? <p className="mt-1 text-xs italic text-neutral-500">{record.notes}</p> : null}
                      </li>
                    ))}
                  </ul>
                  : <p className="mt-1 text-sm text-neutral-500">No energy entries submitted yet.</p>
              )}
              {entity === "PRODUCTS" && (
                query.data.products.length
                  ? <ul className="mt-2 space-y-2 text-sm text-neutral-600">
                    {query.data.products.map((product) => {
                      const category = PRODUCT_CATEGORIES[product.productCategory] ?? product.productCategory;
                      const ecolabel = product.ecolabelStandard === "NONE"
                        ? "None"
                        : (ECOLABEL_STANDARDS[product.ecolabelStandard] ?? product.ecolabelStandard);
                      const unit = UNITS_OF_MEASURE[product.unitOfMeasure] ?? product.unitOfMeasure;
                      return (
                        <li key={product.id} className="rounded-md bg-neutral-50 p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-neutral-800">{product.productName}</span>
                            <span className="font-mono text-xs text-neutral-500">{product.productCode}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span><strong className="font-medium text-neutral-700">Category:</strong> {category}</span>
                            <span><strong className="font-medium text-neutral-700">Ecolabel:</strong> {ecolabel}{product.licenseNumber ? ` (#${product.licenseNumber})` : ""}</span>
                            <span><strong className="font-medium text-neutral-700">Unit:</strong> {unit}</span>
                            <span><strong className="font-medium text-neutral-700">Circular/Reused:</strong> {product.isRepairedOrReused ? "Yes" : "No"}</span>
                          </div>
                          {product.notes ? <p className="mt-1 text-xs italic text-neutral-500">{product.notes}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                  : <p className="mt-1 text-sm text-neutral-500">No product entries submitted yet.</p>
              )}
            </section>
          ))}
          {query.data.status.requiredEntities.length === 0 && (
            <p className="text-sm text-neutral-500">No information categories have been requested.</p>
          )}
        </div>
      )}
    </VehicleDialog>
  );
}
