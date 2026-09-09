import { apiFetch } from "./client";

// TODO: define the real DTO shape in src/types and use it here
export function getCertificates() {
  return apiFetch<unknown[]>("/certificates");
}
