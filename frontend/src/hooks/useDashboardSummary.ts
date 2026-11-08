import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as dashboardApi from "../api/dashboard";
import type { AlertContentUpdate, AlertStatus, DashboardSummary } from "../types/dashboard";

const DASHBOARD_QUERY_KEY = ["dashboard-summary"];

export function useDashboardSummary() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: dashboardApi.getDashboardSummary,
   staleTime: 60_000,
 });
}

export function useUpdateAlertStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) =>
      dashboardApi.updateAlertStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}

export function useUpdateManualAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: AlertContentUpdate }) => dashboardApi.updateManualAlert(id, changes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}

export function useResyncDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dashboardApi.resyncDashboard,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}
