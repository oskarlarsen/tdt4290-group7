import type { DerivedContract } from "../types/contract";
import { getDashboardSummary } from "./dashboard";
import { getFleet } from "./vehicles";

// A contract is a real active agreement, with the supplier's stored risk. The backend has no contract
// records or document store yet. Demo data comes from seeding the backend (scripts/seed-demo-data.mjs).
export async function getContracts(): Promise<DerivedContract[]> {
  const [fleet, summary] = await Promise.all([getFleet(), getDashboardSummary()]);
  const suppliers = new Map(fleet.suppliers.map((supplier) => [supplier.id, supplier]));
  const insights = new Map(summary.topRiskSuppliers.map((supplier) => [supplier.id, supplier]));
  const today = new Date().toISOString().slice(0, 10);
  return fleet.agreements.flatMap((agreement): DerivedContract[] => {
    const supplier = suppliers.get(agreement.supplierId);
    if (!supplier || !agreement.active) return [];
    const insight = insights.get(supplier.id);
    const vehicles = fleet.vehicles.filter((vehicle) => vehicle.agreementId === agreement.id && vehicle.listed);
    const daysLeft = (Date.parse(agreement.endDate) - Date.parse(today)) / 86_400_000;
    return [{
      id: agreement.id,
      contractName: agreement.saksnr ?? "Avtale uten saksnummer",
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrgId: supplier.orgNumber,
      risk: insight?.risk ?? "unassessed",
      mainIssue: insight?.mainIssue ?? "",
      vehicleCount: agreement.requiresVehicles ? vehicles.length : undefined,
      status: daysLeft < 0 ? "Expired" : daysLeft <= 90 ? "Expiring Soon" : "Active",
      startDate: agreement.startDate,
      endDate: agreement.endDate,
      documentUrl: null,
    }];
  });
}
