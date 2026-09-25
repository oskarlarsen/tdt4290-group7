import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth";
import {
  getStoredToken,
  storeToken,
  clearStoredToken,
  getStoredLastActive,
  recordLastActive,
  SESSION_EXPIRED_EVENT,
} from "../api/client";
import type { AuthUser, LoginRequest } from "../types/auth";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /** True only during the initial "is there a valid session already?" check. */
  isInitializing: boolean;
  lastActiveAt: string | null;
  login: (payload: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);

  // Restore the session from a stored token when the app starts
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setStatus("unauthenticated");
      setIsInitializing(false);
      return;
    }

    authApi
      .getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setStatus("authenticated");
        setLastActiveAt(getStoredLastActive(currentUser.id));
      })
      .catch(() => {
        clearStoredToken();
        setStatus("unauthenticated");
      })
      .finally(() => setIsInitializing(false));
  }, []);

  // Record real interaction while authenticated, rather than render/load time.
  useEffect(() => {
    if (status !== "authenticated" || !user) return;

    function handleActivity() {
      setLastActiveAt(recordLastActive(user.id));
    }

    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [status, user]);

  // Handle invalid sessions centrally when the backend returns 401
  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      setStatus("unauthenticated");
      setError("Your session has expired. Please sign in again.");
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    setStatus("loading");
    setError(null);
    try {
      const response = await authApi.login(payload);
      storeToken(response.token, payload.rememberMe);
      // Completing a login is an actual application usage event.
      setLastActiveAt(recordLastActive(response.user.id));
      setUser(response.user);
      setStatus("authenticated");
      return response.user;
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? "Couldn't sign in. Check your email/username and password and try again."
          : "Something went wrong. Please try again."
      );
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearStoredToken();
      setUser(null);
      setLastActiveAt(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, error, isInitializing, lastActiveAt, login, logout }),
    [user, status, error, isInitializing, lastActiveAt, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}