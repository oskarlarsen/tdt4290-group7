import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type Props = { role: "admin" | "supplier"; children: React.ReactNode };

// NOTE: this is a UX convenience only. The backend must independently
// enforce role-based access control on every request — see the
// Access Control & RBAC design doc.
export function ProtectedRoute({ role, children }: Props) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
