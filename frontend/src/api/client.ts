const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Notify AuthContext when the session becomes invalid
export const SESSION_EXPIRED_EVENT = "auth:session-expired";
const LAST_ACTIVE_STORAGE_KEY = "last_active_at";

// The session token lives in an HttpOnly cookie set by the backend, so scripts never see it.
// Earlier versions kept it in web storage; remove any leftover copy so it can't be stolen.
const LEGACY_TOKEN_STORAGE_KEY = "auth_token";
try {
  localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
} catch {
  // Storage can be unavailable (e.g. blocked site data); nothing to clean up then.
}

/** Non-2xx response; `message` is the backend's user-facing message when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type ApiFetchOptions<T> = {
  /** Set false when a 401 is an expected answer rather than a lost session (e.g. login, startup check). */
  notifySessionExpired?: boolean;
  parseResponse?: (text: string) => T;
};

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

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  { notifySessionExpired = true, parseResponse }: ApiFetchOptions<T> = {}
): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    // Send the auth cookie to the API, which may be on another origin
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    // Handle an invalid or expired session reported by the backend
    if (notifySessionExpired) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown; error?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : `API error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text.trim() ? (parseResponse ? parseResponse(text) : JSON.parse(text) as T) : (undefined as T);
}
