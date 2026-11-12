import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/vehicles";
export function useFleet(enabled = true) { return useQuery({ queryKey: ["vehicles", "fleet"], queryFn: api.getFleet, enabled, retry: false }); }
export function useArchive() { return useQuery({ queryKey: ["vehicles", "archive"], queryFn: api.getArchive, retry: false }); }
export function useFleetHistory(page: number) { return useQuery({ queryKey: ["vehicles", "changes", page], queryFn: () => api.getFleetHistory(page), retry: false }); }
export function useVehicle(plate: string, agreementId?: string | null) { return useQuery({ queryKey: ["vehicles", "detail", plate, agreementId ?? null], queryFn: () => api.getVehicle(plate, agreementId), retry: false }); }
export function useStatistics(search: string, page: number) {
  return useQuery({ queryKey: ["vehicles", "statistics", search, page], queryFn: () => api.getStatistics(search, page), retry: false });
}
export function useVehicleHistory(plate: string, page: number) { return useQuery({ queryKey: ["vehicles", "history", plate, page], queryFn: () => api.getHistory(plate, page), retry: false }); }
export function useVehicleCheck(id?: string | null) { return useQuery({ queryKey: ["vehicles", "check", id], queryFn: () => api.getCheck(id!), enabled: !!id, retry: false, staleTime: Infinity }); }
export function useRefreshVehicles() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["vehicles"] });
}
