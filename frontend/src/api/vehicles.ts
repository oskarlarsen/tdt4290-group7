import { apiFetch } from "./client";
import type { ApprovalInput, ApprovalStatus, CheckHistory, StoredApproval, VehicleCheck, VehicleDetails, VehicleList, StatisticsList, StatisticsSave } from "../types/vehicle";
import { parseVehicleJson } from "../utils/vehicle";

// Always real API calls, even when the separate login flow uses mocks.
function vehicleFetch<T>(path: string, options?: RequestInit) {
  return apiFetch<T>(path, options, { parseResponse: parseVehicleJson<T> });
}
export function getVehicles(search: string, status: ApprovalStatus | "", page: number) {
  const query = new URLSearchParams({ search, page: String(page), pageSize: "25" });
  if (status) query.set("approvalStatus", status);
  return vehicleFetch<VehicleList>(`/vehicles?${query}`);
}
export const getVehicle = (plate: string) => vehicleFetch<VehicleDetails>(`/vehicles/${encodeURIComponent(plate)}`);
export const getHistory = (plate: string, page: number) => vehicleFetch<CheckHistory>(`/vehicles/${encodeURIComponent(plate)}/checks?page=${page}&pageSize=10`);
export const getCheck = (id: string) => vehicleFetch<VehicleCheck>(`/vehicle-checks/${encodeURIComponent(id)}`);
export const runCheck = (plate: string, forceRefresh: boolean) => vehicleFetch<VehicleCheck>("/vehicle-checks", {
  method: "POST", body: JSON.stringify({ registrationNumber: plate, forceRefresh }),
});
export const appendStatistics = (body: string) => vehicleFetch<StatisticsSave>("/trip-rows", { method: "POST", body });
export const getStatistics = (search: string, page: number) => vehicleFetch<StatisticsList>(
  `/trip-rows?${new URLSearchParams({ search, page: String(page), pageSize: "25" })}`);
export const saveApproval = (approval: ApprovalInput, sourceName?: string | null) => vehicleFetch<unknown>("/vehicle-approvals", {
  method: "POST", body: JSON.stringify({ sourceName, approvals: [approval] }),
});
export const revokeApproval = (plate: string) => vehicleFetch<StoredApproval>(`/vehicle-approvals/${encodeURIComponent(plate)}/revoke`, { method: "POST" });
