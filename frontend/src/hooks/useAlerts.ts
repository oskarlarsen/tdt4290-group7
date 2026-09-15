import { useQuery } from "@tanstack/react-query";
// import { getAlerts } from "../api/alerts";

// TODO: call the real API client once the backend contract is agreed
export function useAlerts() {
  return useQuery({
    queryKey: ["Alerts"],
    queryFn: async () => {
      throw new Error("useAlerts: not yet implemented");
    },
  });
}
