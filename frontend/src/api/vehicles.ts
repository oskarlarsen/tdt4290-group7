import { apiFetch } from "./client";
import type { CheckHistory, VehicleCheck, VehicleDetails, StatisticsList, StatisticsSave, FleetOverview, FleetArchive, FleetChange, FleetSupplier, FleetAgreement, AgreementInput, VehicleEntryInput, Vehicle } from "../types/vehicle";
import { parseVehicleJson } from "../utils/vehicle";

// Always real API calls, even when the separate login flow uses mocks.
function vehicleFetch<T>(path: string, options?: RequestInit) {
  return apiFetch<T>(path, options, { parseResponse: parseVehicleJson<T> });
}
// A truck can be listed under several agreements; agreementId picks the one to look at (otherwise the best fit).
export const getVehicle = (plate: string, agreementId?: string | null) => vehicleFetch<VehicleDetails>(`/vehicles/${encodeURIComponent(plate)}${agreementId ? `?agreementId=${encodeURIComponent(agreementId)}` : ""}`);
export const getHistory = (plate: string, page: number) => vehicleFetch<CheckHistory>(`/vehicles/${encodeURIComponent(plate)}/checks?page=${page}&pageSize=10`);
export const getCheck = (id: string) => vehicleFetch<VehicleCheck>(`/vehicle-checks/${encodeURIComponent(id)}`);
export const runCheck = (plate: string, forceRefresh: boolean, agreementId?: string | null) => vehicleFetch<VehicleCheck>("/vehicle-checks", {
  method: "POST", body: JSON.stringify({ registrationNumber: plate, forceRefresh, ...(agreementId ? { agreementId } : {}) }),
});
export const appendStatistics = (body: string) => vehicleFetch<StatisticsSave>("/trip-rows", { method: "POST", body });
export const getStatistics = (search: string, page: number) => vehicleFetch<StatisticsList>(
  `/trip-rows?${new URLSearchParams({ search, page: String(page), pageSize: "25" })}`);
const fleetPath = "/vehicle-fleet";
// The same truck can be listed under several agreements, so removing or replacing says which listing.
const listing = (vehicle: Vehicle) => (vehicle.agreementId ? `?agreementId=${encodeURIComponent(vehicle.agreementId)}` : "");
export const getFleet = () => vehicleFetch<FleetOverview>(fleetPath);
export const getFleetHistory = (page: number) => vehicleFetch<FleetChange[]>(`${fleetPath}/history?page=${page}`);
export const saveSupplier = (input: { name: string; orgNumber: string; confirmNewSupplier?: boolean }, existing?: FleetSupplier) => vehicleFetch<FleetSupplier>(`${fleetPath}/suppliers${existing ? `/${encodeURIComponent(existing.id)}` : ""}`, { method: existing ? "PUT" : "POST", body: JSON.stringify(existing ? { supplier: input, expectedUpdatedAt: existing.updatedAt } : input) });
export const removeSupplier = (supplier: FleetSupplier) => vehicleFetch<void>(`${fleetPath}/suppliers/${encodeURIComponent(supplier.id)}`, { method: "DELETE", body: JSON.stringify({ expectedUpdatedAt: supplier.updatedAt }) });
export const getArchive = () => vehicleFetch<FleetArchive>(`${fleetPath}/archive`);
export const reactivateSupplier = (supplier: FleetSupplier) => vehicleFetch<FleetSupplier>(`${fleetPath}/suppliers/${encodeURIComponent(supplier.id)}/reactivate`, { method: "POST", body: JSON.stringify({ expectedUpdatedAt: supplier.updatedAt }) });
export const inviteSupplier = (supplierId: string, email: string) => vehicleFetch<{ email: string; token: string; expiresAt: string }>(
  `${fleetPath}/suppliers/${encodeURIComponent(supplierId)}/invitations`,
  { method: "POST", body: JSON.stringify({ email }) }
);
export const saveAgreement = (input: AgreementInput, existing?: FleetAgreement) => vehicleFetch<FleetAgreement>(`${fleetPath}/agreements${existing ? `/${existing.id}` : ""}`, { method: existing ? "PUT" : "POST", body: JSON.stringify(existing ? { agreement: input, expectedUpdatedAt: existing.updatedAt } : input) });
export const removeAgreement = (agreement: FleetAgreement) => vehicleFetch<void>(`${fleetPath}/agreements/${agreement.id}`, { method: "DELETE", body: JSON.stringify({ expectedUpdatedAt: agreement.updatedAt }) });
export const addVehicle = (agreementId: string, input: VehicleEntryInput) => vehicleFetch<Vehicle>(`${fleetPath}/agreements/${agreementId}/vehicles`, { method: "POST", body: JSON.stringify(input) });
export const replaceVehicle = (vehicle: Vehicle, replacement: VehicleEntryInput) => vehicleFetch<Vehicle>(`${fleetPath}/vehicles/${encodeURIComponent(vehicle.registrationNumber)}/replace${listing(vehicle)}`, { method: "POST", body: JSON.stringify({ replacement, expectedUpdatedAt: vehicle.updatedAt }) });
export const removeVehicle = (vehicle: Vehicle) => vehicleFetch<void>(`${fleetPath}/vehicles/${encodeURIComponent(vehicle.registrationNumber)}${listing(vehicle)}`, { method: "DELETE", body: JSON.stringify({ expectedUpdatedAt: vehicle.updatedAt }) });
export const undoChange = (id: string) => vehicleFetch<void>(`${fleetPath}/history/${id}/undo`, { method: "POST" });
