import { apiFetch } from "./client";
import type { Certificate } from "../types/certificate";

export function getCertificates(): Promise<Certificate[]> {
  return apiFetch<Certificate[]>("/certificates");
}

export function uploadCertificate(file: File, supplierName: string): Promise<Certificate> {
  const form = new FormData();
  form.append("supplierName", supplierName);
  form.append("file", file);
  return apiFetch<Certificate>("/certificates", { method: "POST", body: form });
}

export type CertificateUpdate = Pick<
  Certificate,
  "supplierName" | "certificateType" | "issueDate" | "expiryDate" | "contractId"
>;

export function updateCertificate(id: string, updates: CertificateUpdate): Promise<Certificate> {
  return apiFetch<Certificate>(`/certificates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export function deleteCertificate(id: string): Promise<void> {
  return apiFetch<void>(`/certificates/${encodeURIComponent(id)}`, { method: "DELETE" });
}
