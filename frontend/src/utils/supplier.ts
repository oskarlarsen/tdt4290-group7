export const DUPLICATE_SUPPLIER_ORG_ID_MESSAGE =
  "Det finnes allerede en leverandør med dette organisasjonsnummeret.";

export function normalizeSupplierOrgId(orgId: string): string {
  return orgId.trim().replace(/\s+/g, " ").toUpperCase();
}
