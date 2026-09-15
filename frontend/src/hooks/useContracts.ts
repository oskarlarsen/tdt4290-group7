import { useQuery } from "@tanstack/react-query";
// import { getContracts } from "../api/contracts";

// TODO: call the real API client once the backend contract is agreed
export function useContracts() {
  return useQuery({
    queryKey: ["Contracts"],
    queryFn: async () => {
      throw new Error("useContracts: not yet implemented");
    },
  });
}
