import { useQuery } from "@tanstack/react-query";
import { getEnergyData } from "../api/energy";

export function useEnergy() {
  return useQuery({
    queryKey: ["energy"],
    queryFn: getEnergyData,
    staleTime: 60_000,
  });
}