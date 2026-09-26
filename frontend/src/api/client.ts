const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_STORAGE_KEY = "auth_token";

// Notify AuthContext when the session becomes invalid
export const SESSION_EXPIRED_EVENT = "auth:session-expired";
const LAST_ACTIVE_STORAGE_KEY = "last_active_at";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeToken(token: string, _rememberMe: boolean) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}
// TODO: Implement "remember me" with a backend-managed persistent session

// Persist activity per user so it survives refreshes and is not confused with
// the current tab/session start or the dashboard data sync timestamp.
function lastActiveStorageKey(userId: string) {
  return `${LAST_ACTIVE_STORAGE_KEY}:${userId}`;
}

export function getStoredLastActive(userId: string): string | null {
  return localStorage.getItem(lastActiveStorageKey(userId));
}

export function storeLastActive(userId: string, iso: string) {
  localStorage.setItem(lastActiveStorageKey(userId), iso);
}

export function recordLastActive(userId: string): string {
  const now = new Date().toISOString();
  storeLastActive(userId, now);
  return now;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    // Handle an invalid or expired session reported by the backend
    clearStoredToken();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}