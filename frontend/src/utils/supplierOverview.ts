import type { Certificate } from "../types/certificate";
import type { DerivedContract } from "../types/contract";
import type { RecentAlert, TopRiskSupplier } from "../types/dashboard";
import type { EnergyContract } from "../types/energy";
import type { FleetOverview } from "../types/vehicle";

export const MOCK_SUPPLIER_MAPPING = "sup-c"; // Phase 1.1: Named constant for mapping

export type RequiredAction = {
  title: string;
  reason: string;
  link: string;
  priority: number; // lower is higher priority
};

export type SupplierOverviewData = {
  supplier: { name: string; orgId: string } | null;
  contract: DerivedContract | null;
  indicators: TopRiskSupplier | null; // Reusing TopRiskSupplier for indicators
  requiredActions: RequiredAction[];
  summaries: {
    certificates: { valid: number; expiring: number; expired: number; missing: number };
    vehicles: { tracked: number; flagged: number; state: "normal" | "not-applicable" | "data-missing" };
    energy: {
      state: "normal" | "not-applicable" | "data-missing";
      selfProducedKwh?: number;
      committedSelfProducedKwh?: number;
      isBreach?: boolean;
    };
  };
  raw: {
    vehicles: FleetOverview | null;
    certificates: Certificate[];
    energy: EnergyContract | undefined;
  };
  alerts: RecentAlert[];
};

export function buildSupplierOverview(
  supplierId: string,
  allSuppliers: TopRiskSupplier[],
  allContracts: DerivedContract[],
  allCertificates: Certificate[],
  fleetRes: FleetOverview | null,
  energyData: EnergyContract[],
  allAlerts: RecentAlert[]
): SupplierOverviewData {

  const supplierRecord = allSuppliers.find(s => s.id === supplierId) || null;
  const supplier = supplierRecord ? { name: supplierRecord.displayName, orgId: supplierRecord.orgId } : null;

  // Contracts are derived 1:1, so contract id = supplier id
  const contract = allContracts.find(c => c.supplierId === supplierId) || null;
  const contractId = contract?.id || supplierId; // Fallback to supplierId as per rules

  const indicators = supplierRecord;

  // Scoping data
  const myCertificates = allCertificates.filter(c => c.contractId === contractId);
  const myEnergy = energyData.find(row => row.agreementId === contractId);
  const myAlerts = allAlerts.filter(a => a.supplierId === supplierId);

  // Summaries calculation
  const now = new Date();
  let validCerts = 0; let expiringCerts = 0; let expiredCerts = 0; let missingCerts = 0;
  myCertificates.forEach(cert => {
    if (!cert.certificateNumber && !cert.validUntil) {
      missingCerts++;
    } else if (cert.validUntil) {
      const validUntilDate = new Date(cert.validUntil);
      const daysUntilExpiry = Math.ceil((validUntilDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (daysUntilExpiry < 0) expiredCerts++;
      else if (daysUntilExpiry <= 30) expiringCerts++;
      else validCerts++;
    }
  });

  let vehicleState: "normal" | "not-applicable" | "data-missing" = "normal";
  let trackedVehicles = 0;
  let flaggedVehicles = 0;

  // Fleet logic:
  // If there's no fleet data, we assume data-missing.
  // Wait, how do we link fleet to supplier? FleetOverview has `agreements`.
  // `agreements` has `supplierId`. `vehicles` has `agreementId`.
  let myVehiclesCount = 0;
  if (fleetRes) {
     const myAgreement = fleetRes.agreements.find(a => a.supplierId === supplierId);
     if (myAgreement) {
         myVehiclesCount = fleetRes.vehicles.filter(v => v.agreementId === myAgreement.id).length;
     }
  }

  if (!fleetRes) {
      vehicleState = "data-missing";
  } else if (myVehiclesCount === 0) {
      vehicleState = "data-missing";
  } else {
      trackedVehicles = myVehiclesCount;
      flaggedVehicles = myAlerts.filter(a => a.category === "VEHICLE_COMPLIANCE" || a.affectedItem?.type === "Vehicle").length; // Approximation for V1
  }

  // Only contracts that require energy reporting have a summary.
  let energyState: "normal" | "not-applicable" | "data-missing" = "normal";
  let selfProducedKwh: number | undefined;
  let committedSelfProducedKwh: number | undefined;
  let isBreach = false;

  if (!myEnergy) {
      energyState = "not-applicable";
  } else if (myEnergy.status === "MISSING_DATA") {
      energyState = "data-missing";
  } else {
      selfProducedKwh = myEnergy.selfProducedKwh;
      committedSelfProducedKwh = myEnergy.commitment?.minSelfProducedKwh;
      isBreach = myEnergy.status === "NON_COMPLIANT";
  }

  // Required Actions mapping
  const requiredActions: RequiredAction[] = [];

  if (missingCerts > 0) {
      requiredActions.push({ title: "Last opp sertifikatdokumentasjon", reason: "Sertifikatdokumentasjon mangler", link: "/supplier/certificates", priority: 1 });
  }
  if (expiredCerts > 0) {
      requiredActions.push({ title: "Forny sertifikatet", reason: "Sertifikatet er utløpt", link: "/supplier/certificates", priority: 2 });
  }
  if (expiringCerts > 0) {
      requiredActions.push({ title: "Planlegg fornyelsen", reason: "Sertifikatet utløper snart", link: "/supplier/certificates", priority: 3 });
  }
  if (vehicleState === "data-missing") {
      requiredActions.push({ title: "Send inn kjøretøydata", reason: "Kjøretøydata er ikke sendt inn", link: "/supplier/vehicles", priority: 4 });
  }
  if (flaggedVehicles > 0) {
      requiredActions.push({ title: "Gå gjennom markerte kjøretøy", reason: "Markerte kjøretøy", link: "/supplier/vehicles", priority: 5 });
  }
  if (energyState === "data-missing") {
      requiredActions.push({ title: "Send inn energidata", reason: "Energidata er ikke sendt inn", link: "/supplier/energy", priority: 6 });
  }
  if (isBreach) {
      requiredActions.push({ title: "Gå gjennom energidata", reason: "Energiforpliktelsen er ikke oppfylt", link: "/supplier/energy", priority: 7 });
  }

  requiredActions.sort((a, b) => a.priority - b.priority);

  return {
    supplier,
    contract,
    indicators,
    requiredActions,
    summaries: {
      certificates: { valid: validCerts, expiring: expiringCerts, expired: expiredCerts, missing: missingCerts },
      vehicles: { tracked: trackedVehicles, flagged: flaggedVehicles, state: vehicleState },
      energy: { state: energyState, selfProducedKwh, committedSelfProducedKwh, isBreach }
    },
    raw: {
      vehicles: fleetRes,
      certificates: myCertificates,
      energy: myEnergy
    },
    alerts: myAlerts
  };
}