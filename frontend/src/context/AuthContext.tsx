import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth";
import { SESSION_EXPIRED_EVENT } from "../api/client";
import type { AuthUser, LoginRequest } from "../types/auth";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /** True only during the initial "is there a valid session already?" check. */
  isInitializing: boolean;
  login: (payload: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Restore the session from the HttpOnly auth cookie when the app starts
  useEffect(() => {
    authApi
      .getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch(() => {
        setStatus("unauthenticated");
      })
      .finally(() => setIsInitializing(false));
  }, []);

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
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, error, isInitializing, login, logout }),
    [user, status, error, isInitializing, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}