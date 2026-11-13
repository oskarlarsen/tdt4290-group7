import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types/auth";

type Props = { role: Role; children: React.ReactNode };

// Route protection improves navigation UX, while authorization is enforced by the backend
export function ProtectedRoute({ role, children }: Props) {
  const { user, isInitializing } = useAuth();

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Laster…</div>;
  }

  if (!user) return <Navigate to="/login" replace state={{ from: window.location.pathname + window.location.search + window.location.hash }} />;
  if (user.role !== role) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}