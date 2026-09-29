import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { initials } from "../../utils/initials";

// Shared by both Admin and Supplier layouts without depending on a specific role
export function ProfileMenu({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!trigger || !menu) return;

      const margin = 8;
      const gap = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - trigger.bottom - margin;
      const spaceAbove = trigger.top - margin;
      const openBelow = spaceBelow >= menu.height + gap || spaceBelow >= spaceAbove;

      const top = openBelow ? trigger.bottom + gap : trigger.top - menu.height - gap;
      const left = trigger.right - menu.width;
      setPosition({
        top: Math.max(margin, Math.min(top, viewportHeight - menu.height - margin)),
        left: Math.max(margin, Math.min(left, viewportWidth - menu.width - margin)),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  if (!user) return null;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const roleLabel = user.role === "ADMIN" ? "Municipal Admin" : "Supplier";
  const userName = user.name?.trim() || "";
  const displayName = userName || (user.role === "ADMIN" ? "Admin" : "Supplier");

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-neutral-50"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-900 text-xs font-semibold text-white">
          {initials(userName)}
        </span>
        {variant === "full" && (
          <span className="flex flex-col items-center justify-center text-center">
            <span className="block text-sm font-medium text-neutral-900">{displayName}</span>
            <span className="block text-xs text-neutral-400">{roleLabel}</span>
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: position.top, left: position.left }}
          className="fixed z-50 max-h-[calc(100vh-1rem)] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-neutral-100 bg-white p-1 shadow-card"
        >
          <div className="border-b border-neutral-100 px-3 py-2">
            <div className="text-sm font-medium text-neutral-900">{displayName}</div>
            <div className="text-xs text-neutral-400">{user.email}</div>
            <div className="mt-1 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-neutral-500">
              {roleLabel}
            </div>
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