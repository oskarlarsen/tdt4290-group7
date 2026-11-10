import { apiFetch } from "./client";
import type { Certificate, CertificateStandard } from "../types/certificate";

type CertificateResponse = {
  id: string;
  supplierName: string;
  certificateType: string;
  issueDate: string | null;
  expiryDate: string | null;
  sourceFile: string;
  contractId: string | null;
  archivedAt?: string | null;
  uploadedByRole?: string | null;
  archivePendingFor?: string | null;
};

export type CertificateUpdate = {
  supplierName: string;
  certificateType: string;
  issueDate: string | null;
  expiryDate: string | null;
  contractId: string | null;
};

function toStandard(value: string): CertificateStandard {
  switch (value.trim().toLowerCase()) {
    case "iso 14001":
      return "iso-14001";
    case "miljøfyrtårn":
    case "miljofyrtarn":
      return "miljofyrtarn";
    case "grønt punkt norge":
    case "gront punkt norge":
      return "gront-punkt-norge";
    case "retura":
      return "retura";
    case "kurs i økonomisk kjøring":
    case "eco-driving course":
      return "eco-driving-course";
    default:
      return "unknown";
  }
}

function toCertificate(response: CertificateResponse): Certificate {
  return {
    id: response.id,
    standard: toStandard(response.certificateType),
    certificateNumber: null,
    contractId: response.contractId ?? "",
    validUntil: response.expiryDate,
    supplierName: response.supplierName,
    certificateType: response.certificateType,
    issueDate: response.issueDate,
    sourceFile: response.sourceFile,
    archivedAt: response.archivedAt ?? null,
    uploadedByRole: response.uploadedByRole ?? null,
    archivePendingFor: response.archivePendingFor ?? null,
  };
}

export async function getCertificates(includeArchived = false): Promise<Certificate[]> {
  const certificates = await apiFetch<CertificateResponse[]>(includeArchived ? "/certificates?includeArchived=true" : "/certificates");
  return certificates.map(toCertificate);
}

export async function uploadCertificate(
  file: File,
  supplierName: string,
  contractId: string,
): Promise<Certificate> {
  if (USE_MOCKS) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newCert: Certificate = {
          id: `cert-mock-${Date.now()}`,
          standard: "unknown",
          certificateNumber: null,
          contractId,
          validUntil: null,
          supplierName,
          certificateType: "Uploaded Document",
          issueDate: new Date().toISOString(),
          sourceFile: file.name,
        };
        db.addMockCertificate(newCert);

        // Fetch supplier ID roughly based on contract mock structure
        // In real backend, this maps internally
        const supplierId = contractId;

        db.addMockPendingReview({
           id: `rev-${Date.now()}`,
           supplierId,
           title: `Certificate Upload: ${file.name}`,
           submittedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
           type: "Document",
           status: "Pending Review",
        });

        resolve(newCert);
      }, 1500);
    });
  }

  const form = new FormData();
  form.append("supplierName", supplierName);
  form.append("contractId", contractId);
  form.append("file", file);
  const response = await apiFetch<CertificateResponse>("/certificates", {
    method: "POST",
    body: form,
  });
  return toCertificate(response);
}

export async function updateCertificate(id: string, updates: CertificateUpdate): Promise<Certificate> {
  const response = await apiFetch<CertificateResponse>(`/certificates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
  return toCertificate(response);
}

export function deleteCertificate(id: string): Promise<void> {
  return apiFetch<void>(`/certificates/${encodeURIComponent(id)}`, { method: "DELETE" });
}


export function archiveCertificate(id: string): Promise<void> {
  return apiFetch<void>(`/certificates/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export function restoreCertificate(id: string): Promise<void> {
  return apiFetch<void>(`/certificates/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export function confirmCertificateArchive(id: string): Promise<void> {
  return apiFetch<void>(`/certificates/${encodeURIComponent(id)}/confirm-archive`, { method: "POST" });
}

export function rejectCertificateArchive(id: string): Promise<void> {
  return apiFetch<void>(`/certificates/${encodeURIComponent(id)}/reject-archive`, { method: "POST" });
}

/** A supplier uploads against one of its own agreements; the server takes the supplier from the login. */
export async function uploadSupplierCertificate(file: File, contractId: string): Promise<Certificate> {
  const form = new FormData();
  form.append("contractId", contractId);
  form.append("file", file);
  const response = await apiFetch<CertificateResponse>("/supplier/certificates", { method: "POST", body: form });
  return toCertificate(response);
}
