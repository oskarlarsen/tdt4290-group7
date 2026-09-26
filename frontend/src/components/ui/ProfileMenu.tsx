import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { initials } from "../../utils/initials";

// Shared by both Admin and Supplier layouts without depending on a specific role
export function ProfileMenu({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const roleLabel = user.role === "ADMIN" ? "Municipal Admin" : "Supplier";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-neutral-50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-900 text-xs font-semibold text-white">
          {initials(user.name)}
        </span>
        {variant === "full" && (
          <span className="text-left">
            <span className="block text-sm font-medium text-neutral-900">{user.name}</span>
            <span className="block text-xs text-neutral-400">{roleLabel}</span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-neutral-100 bg-white p-1 shadow-card">
          <div className="border-b border-neutral-100 px-3 py-2">
            <div className="text-sm font-medium text-neutral-900">{user.name}</div>
            <div className="text-xs text-neutral-400">{user.email}</div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}