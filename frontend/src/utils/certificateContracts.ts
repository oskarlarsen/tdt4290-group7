import { agreementLabel } from "./agreementLabel";
import type { CertificateContract } from "../types/certificate";
import type { FleetOverview } from "../types/vehicle";

export function getActiveCertificateContracts(fleet: FleetOverview): CertificateContract[] {
  const activeSuppliers = new Map(
    fleet.suppliers.filter((supplier) => supplier.active).map((supplier) => [supplier.id, supplier]),
  );

  return fleet.agreements.flatMap((agreement) => {
    const supplier = activeSuppliers.get(agreement.supplierId);
    if (!agreement.active || !supplier) return [];

    return [{
      id: agreement.id,
      contractName: agreementLabel(agreement),
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierOrgId: supplier.orgNumber,
      startDate: agreement.startDate,
      endDate: agreement.endDate,
    }];
  });
}
