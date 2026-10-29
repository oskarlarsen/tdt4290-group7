import { useQuery } from "@tanstack/react-query";
import { getCertificates } from "../api/certificates";

export function useCertificates() {
  return useQuery({
    queryKey: ["certificates"],
    queryFn: getCertificates,
    staleTime: 60_000,
  });
}