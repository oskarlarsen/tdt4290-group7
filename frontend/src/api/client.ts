const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Notify AuthContext when the session becomes invalid
export const SESSION_EXPIRED_EVENT = "auth:session-expired";

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

type ApiFetchOptions = {
  /** Set false when a 401 is an expected answer rather than a lost session (e.g. login, startup check). */
  notifySessionExpired?: boolean;
};

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  { notifySessionExpired = true }: ApiFetchOptions = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    // Send the auth cookie to the API, which may be on another origin
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    // Handle an invalid or expired session reported by the backend
    if (notifySessionExpired) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message : `API error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
