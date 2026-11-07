import type { Certificate } from "../types/certificate";
import type { DerivedContract } from "../types/contract";
import type { RecentAlert, TopRiskSupplier } from "../types/dashboard";
import type { EnergyRequirement, EnergyRecord } from "../types/energy";
import type { FleetOverview } from "../types/vehicle";
import type { PendingReview } from "../mocks/db";

export const MOCK_SUPPLIER_MAPPING = "sup-c"; // Phase 1.1: Named constant for mapping

export type RequiredAction = {
  title: string;
  reason: string;
  link: string;
  priority: number; // lower is higher priority
  contractId?: string;
  contractName?: string;
};

export type ContractOverview = {
  contract: DerivedContract;
  requiredActions: RequiredAction[];
  pendingReviews: PendingReview[];
  summaries: {
    certificates: { valid: number; expiring: number; expired: number; missing: number };
    vehicles: { tracked: number; flagged: number; state: "normal" | "not-applicable" | "data-missing" };
  };
};

export type SupplierOverviewData = {
  supplier: { name: string; orgId: string } | null;
  contract: DerivedContract | null; // Primary contract (for backwards compatibility)
  contracts: DerivedContract[]; // All contracts associated with the supplier
  contractOverviews: ContractOverview[]; // Detailed mapped views per contract
  indicators: TopRiskSupplier | null; // Reusing TopRiskSupplier for indicators
  requiredActions: RequiredAction[];
  summaries: {
    certificates: { valid: number; expiring: number; expired: number; missing: number };
    vehicles: { tracked: number; flagged: number; state: "normal" | "not-applicable" | "data-missing" };
    energy: {
      state: "normal" | "not-applicable" | "data-missing";
      renewableSharePercent?: number;
      minRenewableSharePercent?: number;
      isBreach?: boolean;
    };
  };
  raw: {
    vehicles: FleetOverview | null;
    certificates: Certificate[];
    energy: { requirement: EnergyRequirement | undefined; record: EnergyRecord | undefined };
  };
  alerts: RecentAlert[];
  pendingReviews: PendingReview[];
};

export function buildSupplierOverview(
  supplierId: string,
  allSuppliers: TopRiskSupplier[],
  allContracts: DerivedContract[],
  allCertificates: Certificate[],
  fleetRes: FleetOverview | null,
  energyData: { requirements: EnergyRequirement[]; records: EnergyRecord[] },
  allAlerts: RecentAlert[],
  pendingReviews: PendingReview[] = []
): SupplierOverviewData {

  const supplierRecord = allSuppliers.find(s => s.id === supplierId) || null;
  const supplier = supplierRecord ? { name: supplierRecord.displayName, orgId: supplierRecord.orgId } : null;

  // Contracts
  const myContracts = allContracts.filter(c => c.supplierId === supplierId);
  const contract = myContracts.length > 0 ? myContracts[0] : null;
  const contractId = contract?.id || supplierId; // Fallback to supplierId as per rules

  const indicators = supplierRecord;

  // Scoping data
  const myCertificates = allCertificates.filter(c => c.contractId === contractId);
  const myEnergyReq = energyData.requirements.find(r => r.contractId === contractId);
  const myEnergyRec = energyData.records.find(r => r.contractId === contractId);
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

  let energyState: "normal" | "not-applicable" | "data-missing" = "normal";
  let renewableSharePercent: number | undefined;
  let minRenewableSharePercent: number | undefined;
  let isBreach = false;

  if (!myEnergyReq) {
      energyState = "not-applicable";
  } else if (!myEnergyRec) {
      energyState = "data-missing";
  } else {
      minRenewableSharePercent = myEnergyReq.minRenewableSharePercent;
      const { electric = 0, biogas = 0, fossil = 0 } = myEnergyRec.consumptionKwh;
      const total = electric + biogas + fossil;
      if (total > 0) {
          renewableSharePercent = Math.round(((electric + biogas) / total) * 100);
          isBreach = renewableSharePercent < minRenewableSharePercent;
      } else {
          energyState = "data-missing";
      }
  }

  // Contract Overviews mapping
  const contractOverviews: ContractOverview[] = myContracts.map(contractRow => {
    const cid = contractRow.id;
    const cCerts = allCertificates.filter(c => c.contractId === cid);
    const cPending = pendingReviews.filter(p => p.contractName === contractRow.contractName || !p.contractName); // Rough mapping for demo

    let cValidCerts = 0; let cExpiringCerts = 0; let cExpiredCerts = 0; let cMissingCerts = 0;
    const missingStandards: string[] = [];
    const expiredStandards: string[] = [];
    const expiringStandards: string[] = [];

    cCerts.forEach(cert => {
      if (!cert.certificateNumber && !cert.validUntil) {
        cMissingCerts++;
        missingStandards.push(cert.standard);
      } else if (cert.validUntil) {
        const validUntilDate = new Date(cert.validUntil);
        const daysUntilExpiry = Math.ceil((validUntilDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (daysUntilExpiry < 0) {
           cExpiredCerts++;
           expiredStandards.push(cert.standard);
        } else if (daysUntilExpiry <= 30) {
           cExpiringCerts++;
           expiringStandards.push(cert.standard);
        } else {
           cValidCerts++;
        }
      }
    });

    const cReqActions: RequiredAction[] = [];
    if (cMissingCerts > 0) {
        cReqActions.push({
           title: "Upload certificate documentation",
           reason: `Missing ${missingStandards.join(", ")} for ${contractRow.contractName}`,
           link: "/supplier/certificates",
           priority: 1,
           contractId: cid,
           contractName: contractRow.contractName
        });
    }
    if (cExpiredCerts > 0) {
        cReqActions.push({
           title: "Renew the certificate",
           reason: `Expired ${expiredStandards.join(", ")} for ${contractRow.contractName}`,
           link: "/supplier/certificates",
           priority: 2,
           contractId: cid,
           contractName: contractRow.contractName
        });
    }
    if (cExpiringCerts > 0) {
        cReqActions.push({
           title: "Plan the renewal",
           reason: `Expiring ${expiringStandards.join(", ")} for ${contractRow.contractName}`,
           link: "/supplier/certificates",
           priority: 3,
           contractId: cid,
           contractName: contractRow.contractName
        });
    }

    let cVehState: "normal" | "not-applicable" | "data-missing" = "normal";
    if (!fleetRes) {
        cVehState = "data-missing";
    } else if (myVehiclesCount === 0) {
        cVehState = "data-missing";
    }

    if (cVehState === "data-missing") {
        cReqActions.push({
           title: "Submit vehicle data",
           reason: `Vehicle data not submitted for ${contractRow.contractName}`,
           link: "/supplier/vehicles",
           priority: 4,
           contractId: cid,
           contractName: contractRow.contractName
        });
    }

    cReqActions.sort((a, b) => a.priority - b.priority);

    return {
      contract: contractRow,
      requiredActions: cReqActions,
      pendingReviews: cPending,
      summaries: {
        certificates: { valid: cValidCerts, expiring: cExpiringCerts, expired: cExpiredCerts, missing: cMissingCerts },
        vehicles: { tracked: trackedVehicles, flagged: flaggedVehicles, state: cVehState } // Vehicles roughly mapped at supplier level for now
      }
    };
  });

  // Extract root requiredActions from contractOverviews
  const requiredActions = contractOverviews.flatMap(co => co.requiredActions).sort((a, b) => a.priority - b.priority);

  return {
    supplier,
    contract,
    contracts: myContracts,
    contractOverviews,
    indicators,
    requiredActions,
    summaries: {
      certificates: { valid: validCerts, expiring: expiringCerts, expired: expiredCerts, missing: missingCerts },
      vehicles: { tracked: trackedVehicles, flagged: flaggedVehicles, state: vehicleState },
      energy: { state: energyState, renewableSharePercent, minRenewableSharePercent, isBreach }
    },
    raw: {
      vehicles: fleetRes,
      certificates: myCertificates,
      energy: { requirement: myEnergyReq, record: myEnergyRec }
    },
    alerts: myAlerts,
    pendingReviews
  };
}