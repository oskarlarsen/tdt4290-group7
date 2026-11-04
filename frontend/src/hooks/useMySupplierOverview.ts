import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getContracts } from "../api/contracts";
import { getCertificates } from "../api/certificates";
import { getFleet } from "../api/vehicles";
import { getEnergyData } from "../api/energy";
import { getAlerts } from "../api/alerts";
import * as db from "../mocks/db"; // Fallback to db for modeled suppliers if api is not ready
import { buildSupplierOverview, MOCK_SUPPLIER_MAPPING } from "../utils/supplierOverview";

export function useMySupplierOverview() {
  const { user } = useAuth();
  // Phase 1.1: Map the old "supplier-1" to the real modeled supplier.
  const authSupplierId = user?.supplierId;
  const supplierId = authSupplierId === "supplier-1" ? MOCK_SUPPLIER_MAPPING : authSupplierId;

  return useQuery({
    queryKey: ["supplier-overview", supplierId],
    queryFn: async () => {
      if (!supplierId) {
        throw new Error("Your account isn't linked to a supplier");
      }

      // Fetching all data. The `buildSupplierOverview` function will strictly scope it.
      const [
        allContracts,
        allCertificates,
        energyData,
        allAlerts,
        fleetRes
      ] = await Promise.all([
        getContracts(),
        getCertificates(),
        getEnergyData(),
        getAlerts(),
        getFleet().catch(() => null)
      ]);

      const allSuppliers = db.getTopRiskSuppliers();

      const overview = buildSupplierOverview(
        supplierId,
        allSuppliers,
        allContracts,
        allCertificates,
        fleetRes,
        energyData,
        allAlerts
      );

      if (!overview.supplier) {
          throw new Error("Supplier record not found");
      }

      return overview;
    },
    enabled: !!user,
    retry: false,
  });
}