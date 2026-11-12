import { useQuery } from "@tanstack/react-query";
import { getEnergy } from "../api/energy";

export function useEnergy(year: number) {
  return useQuery({
    queryKey: ["energy", year],
    queryFn: () => getEnergy(year),
    staleTime: 60_000,
  });
}
