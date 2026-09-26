import { apiFetch, getStoredToken } from "./client";
import * as mock from "../mocks/authMock";
import type { LoginRequest, LoginResponse, AuthUser } from "../types/auth";

// Toggle mock authentication while the real auth endpoint is being developed
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// Backend response determines the user's role and redirect target
export function login(payload: LoginRequest): Promise<LoginResponse> {
  if (USE_MOCKS) return mock.mockLogin(payload);

  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout(): Promise<void> {
  if (USE_MOCKS) return mock.mockLogout();
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

// Re-validate the stored token when the app starts
export function getCurrentUser(): Promise<AuthUser> {
  if (USE_MOCKS) {
    const token = getStoredToken();
    if (!token) return Promise.reject(new Error("No session"));
    return mock.mockGetCurrentUser(token);
  }
  return apiFetch<AuthUser>("/auth/me");
}

export function requestPasswordReset(email: string): Promise<void> {
  if (USE_MOCKS) return mock.mockRequestPasswordReset(email);
  return apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}