export const DUPLICATE_SUPPLIER_ORG_ID_MESSAGE =
  "A supplier with this Organization ID already exists.";

export function normalizeSupplierOrgId(orgId: string): string {
  return orgId.trim().replace(/\s+/g, " ").toUpperCase();
}
