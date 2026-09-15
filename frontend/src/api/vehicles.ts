import { apiFetch } from "./client";

// TODO: define the real DTO shape in src/types and use it here
export function getVehicles() {
  return apiFetch<unknown[]>("/vehicles");
}
