import { apiFetch } from "./client";
import type {
  CsvConfirmation,
  CsvPreview,
  OnboardingStatusResponse,
  SupplierProfileResponse,
  SupplierOverview,
} from "../types/onboarding";

export type CsvEntity = "vehicles" | "energy" | "products";

export function getOnboardingStatus() {
  return apiFetch<OnboardingStatusResponse>("/onboarding/status");
}

export function getSupplierOverview() {
  return apiFetch<SupplierOverview>("/supplier/overview");
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
