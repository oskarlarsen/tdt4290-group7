import { useQuery } from "@tanstack/react-query";
// import { getRisk } from "../api/risk";

// TODO: call the real API client once the backend contract is agreed
export function useRisk() {
  return useQuery({
    queryKey: ["Risk"],
    queryFn: async () => {
      throw new Error("useRisk: not yet implemented");
    },
  });
}
