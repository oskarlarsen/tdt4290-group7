import { apiFetch } from "./client";
import * as mock from "../mocks/authMock";
import type { LoginRequest, LoginResponse, AuthUser } from "@/types/auth";

// Toggle mock authentication while the real auth endpoint is being developed
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// Backend response determines the user's role and redirect target
export function login(payload: LoginRequest): Promise<LoginResponse> {
  if (USE_MOCKS) return mock.mockLogin(payload);

  // A 401 here means wrong credentials, not an expired session
  return apiFetch<LoginResponse>(
    "/auth/login",
    { method: "POST", body: JSON.stringify(payload) },
    { notifySessionExpired: false }
  );
}

export function logout(): Promise<void> {
  if (USE_MOCKS) return mock.mockLogout();
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

// Checks for an existing session cookie when the app starts; a 401 just means "not signed in"
export function getCurrentUser(): Promise<AuthUser> {
  if (USE_MOCKS) return mock.mockGetCurrentUser();
  return apiFetch<AuthUser>("/auth/me", undefined, { notifySessionExpired: false });
}

export function requestPasswordReset(email: string): Promise<void> {
  if (USE_MOCKS) return mock.mockRequestPasswordReset(email);
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