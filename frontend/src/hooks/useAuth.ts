import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

// Central access point for auth state used by the rest of the app
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return ctx;
}