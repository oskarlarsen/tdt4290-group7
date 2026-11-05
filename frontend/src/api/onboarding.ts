import { apiFetch } from "./client";
import type {
  CsvConfirmation,
  CsvPreview,
  OnboardingStatusResponse,
  SupplierProfileResponse,
  SupplierOverview,
} from "../types/onboarding";
import type { Certificate } from "../types/certificate";

export type SupplierAgreement = SupplierOverview["agreements"][number];
export type SupplierVehicle = {
  registrationNumber: string;
  agreementId: string | null;
  planned: boolean;
  listed: boolean;
  fuelTechnology: string | null;
  isHybrid: boolean | null;
  fullContractCoverage: boolean | null;
  startYearWeek: string | null;
  endYearWeek: string | null;
  attachmentReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type SupplierEnergyRecord = {
  id: string;
  agreementId: string;
  locationCode: string;
  address: string;
  storageAreaSqm: number | null;
  workshopAreaSqm: number | null;
  otherAreaSqm: number | null;
  reportingYear: number;
  electricityKwh: number;
  districtHeatingKwh: number;
  biogasKwh: number;
  fossilFuelKwh: number;
  selfProducedSolarKwh: number;
  selfProducedHeatpumpKwh: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type SupplierProduct = {
  id: string;
  agreementId: string;
  productCode: string;
  productName: string;
  productCategory: string;
  ecolabelStandard: string;
  licenseNumber: string | null;
  unitOfMeasure: string;
  isRepairedOrReused: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type SupplierCertificateResponse = {
  id: string;
  supplierName: string;
  certificateType: string;
  issueDate: string | null;
  expiryDate: string | null;
  sourceFile: string;
  contractId: string | null;
  archivedAt?: string | null;
  archivePendingFor?: string | null;
};

function certificateStandard(value: string): Certificate["standard"] {
  switch (value.trim().toLowerCase()) {
    case "iso 14001": return "iso-14001";
    case "miljøfyrtårn":
    case "miljofyrtarn": return "miljofyrtarn";
    case "grønt punkt norge":
    case "gront punkt norge": return "gront-punkt-norge";
    case "retura": return "retura";
    case "kurs i økonomisk kjøring":
    case "eco-driving course": return "eco-driving-course";
    default: return "unknown";
  }
}

export type CsvEntity = "vehicles" | "energy" | "products";

export function getOnboardingStatus(supplierId?: string) {
  const query = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
  return apiFetch<OnboardingStatusResponse>(`/onboarding/status${query}`);
}

export function getSupplierOverview() {
  return apiFetch<SupplierOverview>("/supplier/overview");
}

export function getSupplierAgreements() {
  return apiFetch<SupplierAgreement[]>("/supplier/agreements");
}

export function getSupplierVehicles(supplierId?: string) {
  const query = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
  return apiFetch<SupplierVehicle[]>(`/supplier/vehicles${query}`);
}

export function getSupplierEnergy(supplierId?: string) {
  const query = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
  return apiFetch<SupplierEnergyRecord[]>(`/supplier/energy${query}`);
}

export function getSupplierProducts(supplierId?: string) {
  const query = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : "";
  return apiFetch<SupplierProduct[]>(`/supplier/products${query}`);
}

export async function getSupplierCertificates(): Promise<Certificate[]> {
  const certificates = await apiFetch<SupplierCertificateResponse[]>("/supplier/certificates");
  return certificates.map((certificate) => ({
    id: certificate.id,
    supplierName: certificate.supplierName,
    certificateType: certificate.certificateType,
    standard: certificateStandard(certificate.certificateType),
    certificateNumber: null,
    contractId: certificate.contractId ?? "",
    validUntil: certificate.expiryDate,
    issueDate: certificate.issueDate,
    sourceFile: certificate.sourceFile,
    archivedAt: certificate.archivedAt ?? null,
    archivePendingFor: certificate.archivePendingFor ?? null,
  }));
}

export function updateOnboardingProfile(input: {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}) {
  return apiFetch<SupplierProfileResponse>("/onboarding/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function downloadCsvTemplate(entity: CsvEntity) {
  const csv = await apiFetch<string>(
    `/onboarding/templates/${entity}`,
    undefined,
    { parseResponse: (text) => text }
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${entity}_template.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function previewCsv(entity: CsvEntity, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<CsvPreview>(`/onboarding/upload/${entity}/preview`, {
    method: "POST",
    body: formData,
  });
}

export function confirmCsv(entity: CsvEntity, batchId: string) {
  return apiFetch<CsvConfirmation>(`/onboarding/upload/${entity}/confirm`, {
    method: "POST",
    body: JSON.stringify({ batchId }),
  });
}

export function submitOnboarding() {
  return apiFetch<OnboardingStatusResponse>("/onboarding/submit", {
    method: "POST",
  });
}

export function reviewSupplierOnboarding(
  supplierId: string,
  action: "APPROVE" | "REQUEST_CHANGES",
  notes?: string,
) {
  return apiFetch<OnboardingStatusResponse>(
    `/admin/onboarding/${encodeURIComponent(supplierId)}/review`,
    {
      method: "POST",
      body: JSON.stringify({ action, notes }),
    },
  );
}
