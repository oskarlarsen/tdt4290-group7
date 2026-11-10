import { apiFetch } from "./client";

export type AccessEntry = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SUPPLIER";
  supplierId: string | null;
  grantedBy: string | null;
  /** When a stand-in's access ends; null for access with no end date. */
  accessExpiresAt: string | null;
  approved: boolean;
  permanent: boolean;
  active: boolean;
  isYou: boolean;
};

export type AccessInvitation = { email: string; token: string; expiresAt: string; accessExpiresAt: string | null };

/** `contact` marks the first invitation an admin creates for an organization. */
export type PendingInvitation = { email: string; role: "ADMIN" | "SUPPLIER"; supplierId: string | null; supplierName: string | null; expiresAt: string; accessExpiresAt: string | null; contact: boolean };

export function getPendingInvitations(): Promise<PendingInvitation[]> {
  return apiFetch<PendingInvitation[]>("/access/invitations");
}

export function getAccess(): Promise<AccessEntry[]> {
  return apiFetch<AccessEntry[]>("/access");
}

/** Suppliers invite into their own organization; admins invite admins, or colleagues into a supplier organization (supplierId). */
export function inviteToAccess(kind: "supplier" | "admin", email: string, accessEndDate?: string, supplierId?: string): Promise<AccessInvitation> {
  return apiFetch<AccessInvitation>(kind === "supplier" ? "/supplier/colleagues/invitations" : "/admin/team/invitations", {
    method: "POST",
    body: JSON.stringify({ email, ...(accessEndDate ? { accessEndDate } : {}), ...(supplierId ? { supplierId } : {}) }),
  });
}

export function renewAccess(id: string, accessEndDate: string): Promise<void> {
  return apiFetch<void>(`/access/${encodeURIComponent(id)}/renew`, { method: "POST", body: JSON.stringify({ accessEndDate }) });
}

export function revokeAccess(id: string): Promise<void> {
  return apiFetch<void>(`/access/${encodeURIComponent(id)}/revoke`, { method: "POST" });
}

export function approveAccess(id: string): Promise<void> {
  return apiFetch<void>(`/admin/access/${encodeURIComponent(id)}/approve`, { method: "POST" });
}
