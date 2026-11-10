import { useQuery } from "@tanstack/react-query";
import { getAlerts } from "../api/alerts";

// The key deliberately starts with "dashboard-summary". The existing dismiss/restore
// mutations invalidate that prefix, so this list refreshes automatically after any
// dismiss or restore, whether it happens here or on the Dashboard.
export function useAlerts(includeArchived = false) {
  return useQuery({
    queryKey: includeArchived ? ["dashboard-summary", "alerts", "with-archived"] : ["dashboard-summary", "alerts"],
    queryFn: () => getAlerts(includeArchived),
    staleTime: 60_000,
  });
}