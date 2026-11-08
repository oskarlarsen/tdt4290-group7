import { useQuery } from "@tanstack/react-query";
import { getSupplierAlerts } from "../api/supplierAlerts";
import type { AlertCategory } from "../types/dashboard";
import { useAuth } from "./useAuth";

export function useSupplierAlerts(category?: AlertCategory) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["supplier-alerts", user?.id, category ?? "all"],
    queryFn: () => getSupplierAlerts(category),
    enabled: user?.role === "SUPPLIER",
    retry: false,
  });
}
