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
    issueDate: response.issueDate,
    sourceFile: response.sourceFile,
  };
}

export async function getCertificates(): Promise<Certificate[]> {
  const certificates = await apiFetch<CertificateResponse[]>("/certificates");
  return certificates.map(toCertificate);
}

export async function uploadCertificate(
  file: File,
  supplierName: string,
  contractId: string,
): Promise<Certificate> {
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
