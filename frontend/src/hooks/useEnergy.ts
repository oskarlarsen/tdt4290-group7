import { useQuery } from "@tanstack/react-query";
// import { getEnergy } from "../api/energy";

// TODO: call the real API client once the backend contract is agreed
export function useEnergy() {
  return useQuery({
    queryKey: ["Energy"],
    queryFn: async () => {
      throw new Error("useEnergy: not yet implemented");
    },
  });
}
