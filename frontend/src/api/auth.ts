import { apiFetch } from "./client";
import * as mock from "../mocks/authMock";
import type { LoginRequest, LoginResponse, AuthUser } from "@/types/auth";

// Keep demo data independent of authentication: admin API features need a real session.
const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === "true";

// Backend response determines the user's role and redirect target
export function login(payload: LoginRequest): Promise<LoginResponse> {
  if (USE_MOCK_AUTH) return mock.mockLogin(payload);

  // A 401 here means wrong credentials, not an expired session
  return apiFetch<LoginResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify(payload) },
    { notifySessionExpired: false }
  );
}

export function logout(): Promise<void> {
  if (USE_MOCK_AUTH) return mock.mockLogout();
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

// Checks for an existing session cookie when the app starts; a 401 just means "not signed in"
export function getCurrentUser(): Promise<AuthUser> {
  if (USE_MOCK_AUTH) return mock.mockGetCurrentUser();
  return apiFetch<AuthUser>("/auth/me", undefined, { notifySessionExpired: false });
}

export function requestPasswordReset(email: string): Promise<void> {
  if (USE_MOCK_AUTH) return mock.mockRequestPasswordReset(email);
  return apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(payload: {
  token: string;
  newPassword: string;
}): Promise<void> {
  return apiFetch<void>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function acceptSupplierInvitation(payload: { token: string; newPassword: string }): Promise<void> {
  return apiFetch<void>(
    "/auth/accept-invitation",
    { method: "POST", body: JSON.stringify(payload) },
    { notifySessionExpired: false }
  );
}