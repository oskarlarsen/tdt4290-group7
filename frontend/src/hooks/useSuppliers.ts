import { useQuery } from "@tanstack/react-query";
// import { getSuppliers } from "../api/suppliers";

// TODO: call the real API client once the backend contract is agreed
export function useSuppliers() {
  return useQuery({
    queryKey: ["Suppliers"],
    queryFn: async () => {
      throw new Error("useSuppliers: not yet implemented");
    },
  });
}
