import { useQuery } from "@tanstack/react-query";
// import { getVehicles } from "../api/vehicles";

// TODO: call the real API client once the backend contract is agreed
export function useVehicles() {
  return useQuery({
    queryKey: ["Vehicles"],
    queryFn: async () => {
      throw new Error("useVehicles: not yet implemented");
    },
  });
}
