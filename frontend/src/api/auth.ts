import { apiFetch } from "./client";
import type { LoginRequest, LoginResponse, AuthUser } from "../types/auth";

// Backend response determines the user's role and redirect target
export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

 // Re-validate the stored token when the app starts
export function getCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me");
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch<void>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}