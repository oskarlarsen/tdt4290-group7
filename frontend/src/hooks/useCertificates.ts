import { useQuery } from "@tanstack/react-query";
// import { getCertificates } from "../api/certificates";

// TODO: call the real API client once the backend contract is agreed
export function useCertificates() {
  return useQuery({
    queryKey: ["Certificates"],
    queryFn: async () => {
      throw new Error("useCertificates: not yet implemented");
    },
  });
}
