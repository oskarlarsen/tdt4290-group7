import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/vehicles";
import type { ApprovalStatus } from "../types/vehicle";

export function useVehicles(search: string, status: ApprovalStatus | "", page: number, enabled = true) {
  return useQuery({
    queryKey: ["vehicles", "list", search, status, page],
    queryFn: () => api.getVehicles(search, status, page),
    enabled,
    retry: false,
  });
}
export function useVehicle(plate: string) { return useQuery({ queryKey: ["vehicles", "detail", plate], queryFn: () => api.getVehicle(plate), retry: false }); }
export function useStatistics(search: string, page: number) {
  return useQuery({ queryKey: ["vehicles", "statistics", search, page], queryFn: () => api.getStatistics(search, page), retry: false });
}
export function useVehicleHistory(plate: string, page: number) { return useQuery({ queryKey: ["vehicles", "history", plate, page], queryFn: () => api.getHistory(plate, page), retry: false }); }
export function useVehicleCheck(id?: string | null) { return useQuery({ queryKey: ["vehicles", "check", id], queryFn: () => api.getCheck(id!), enabled: !!id, retry: false, staleTime: Infinity }); }
export function useRefreshVehicles() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["vehicles"] });
}
