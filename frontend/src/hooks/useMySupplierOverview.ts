import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import {
  getSupplierAgreements,
  getSupplierCertificates,
  getSupplierEnergy,
  getSupplierOverview,
  getSupplierProducts,
  getSupplierVehicles,
  type SupplierAgreement,
  type SupplierEnergyRecord,
  type SupplierProduct,
  type SupplierVehicle,
} from "../api/onboarding";
import type { Certificate } from "../types/certificate";
import type { SupplierOverview } from "../types/onboarding";

export type SupplierWorkspaceData = {
  overview: SupplierOverview;
  agreements: SupplierAgreement[];
  vehicles: SupplierVehicle[];
  energy: SupplierEnergyRecord[];
  products: SupplierProduct[];
  certificates: Certificate[];
};

export function useMySupplierOverview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["supplier-workspace", user?.id],
    queryFn: async (): Promise<SupplierWorkspaceData> => {
      const [overview, agreements, vehicles, energy, products, certificates] = await Promise.all([
        getSupplierOverview(),
        getSupplierAgreements(),
        getSupplierVehicles(),
        getSupplierEnergy(),
        getSupplierProducts(),
        getSupplierCertificates(),
      ]);
      return { overview, agreements, vehicles, energy, products, certificates };
    },
    enabled: user?.role === "SUPPLIER" && !!user.supplierId,
    retry: false,
  });
}
