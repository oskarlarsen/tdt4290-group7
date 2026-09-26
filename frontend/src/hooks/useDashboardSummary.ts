import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as dashboardApi from "../api/dashboard";
import type { DashboardSummary } from "../types/dashboard";

const DASHBOARD_QUERY_KEY = ["dashboard-summary"];

 export function useDashboardSummary() {
   return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: dashboardApi.getDashboardSummary,
     staleTime: 60_000,
   });
 }

export function useDismissAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dismissedBy }: { id: string; dismissedBy: string }) =>
      dashboardApi.dismissAlert(id, dismissedBy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }),
  });
}

// Not wired to any button yet — exists so a future "Dismissed Alerts"
// view can call it without touching this file again.
export function useRestoreAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => dashboardApi.restoreAlert(alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }),
  });
}

export function useResyncDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dashboardApi.resyncDashboard(),
    onSuccess: ({ lastSyncedAt }) => {
      // Apply the server/mock response immediately so the button never leaves
      // the dashboard showing the previous sync time while the refetch runs.
      queryClient.setQueryData<DashboardSummary>(DASHBOARD_QUERY_KEY, (current) =>
        current ? { ...current, lastSyncedAt } : current
      );
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}