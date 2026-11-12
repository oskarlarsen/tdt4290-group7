import { apiFetch, API_BASE_URL } from "./client";
import type { EnergyCommitment, EnergyData } from "../types/energy";

export function getEnergy(year: number): Promise<EnergyData> {
  return apiFetch<EnergyData>(`/admin/energy?year=${year}`);
}

/** The supplier's own agreements for a year: the promised kWh and how delivery compares. */
export function getMyEnergySummary(year: number): Promise<EnergyData> {
  return apiFetch<EnergyData>(`/onboarding/energy/summary?year=${year}`);
}

export function setEnergyCommitment(agreementId: string, commitment: EnergyCommitment): Promise<void> {
  return apiFetch<void>(`/admin/energy/${encodeURIComponent(agreementId)}/commitment`, {
    method: "PUT",
    body: JSON.stringify(commitment),
  });
}

// Downloads go through a plain link so the browser streams the file with the session cookie.
export const adminEnergyEvidenceHref = (id: string) => `${API_BASE_URL}/admin/energy/evidence/${encodeURIComponent(id)}`;
export const supplierEnergyEvidenceHref = (id: string) => `${API_BASE_URL}/onboarding/energy/evidence/${encodeURIComponent(id)}`;
