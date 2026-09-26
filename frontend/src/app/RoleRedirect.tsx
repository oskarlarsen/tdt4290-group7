import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Central mapping from the authenticated user to their landing page
export function RoleRedirect() {
  const { user, isInitializing } = useAuth();

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ADMIN") return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/supplier/dashboard" replace />;
}