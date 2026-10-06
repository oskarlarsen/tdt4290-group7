import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Languages, Settings, Sun, UserRound } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { initials } from "../../utils/initials";

type DashboardLanguage = "en" | "no";

const LANGUAGE_STORAGE_KEY = "dashboard-language";

function getStoredLanguage(): DashboardLanguage {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "no" ? "no" : "en";
  } catch {
    return "en";
  }
}

// Shared by both Admin and Supplier layouts without depending on a specific role
export function ProfileMenu({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<DashboardLanguage>(getStoredLanguage);
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

  function handleLanguageChange(value: DashboardLanguage) {
    setLanguage(value);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
    } catch {
      // Keep the preference for this session if browser storage is unavailable.
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={variant === "compact" ? "Settings" : "Open profile menu"}
        title={variant === "compact" ? "Settings" : undefined}
        className={`flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-neutral-50 ${variant === "full" ? "w-full" : ""}`}
      >
        {variant === "compact" ? (
          <Settings className="h-5 w-5 text-neutral-600" aria-hidden="true" />
        ) : (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-900 text-xs font-semibold text-white">
              {initials(userName)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start text-left">
              <span className="block w-full truncate text-sm font-medium text-neutral-900">{displayName}</span>
              <span className="block text-xs text-neutral-400">{roleLabel}</span>
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: position.top, left: position.left }}
          className={`fixed z-50 max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-neutral-100 bg-white shadow-card ${variant === "compact" ? "w-80" : "w-56 p-1"}`}
        >
          {variant === "compact" ? (
            <>
              <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5">
                <Settings className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                <div>
                  <div className="text-sm font-medium text-neutral-900">Settings</div>
                  <div className="text-xs text-neutral-400">Dashboard preferences</div>
                </div>
              </div>

              <div className="border-b border-neutral-100 px-3 py-3">
                <label htmlFor="dashboard-language" className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                  <Languages className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                  Language
                </label>
                <select
                  id="dashboard-language"
                  value={language}
                  onChange={(event) => handleLanguageChange(event.target.value as DashboardLanguage)}
                  className="mt-2 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-800 focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-700/20"
                >
                  <option value="en">English</option>
                  <option value="no">Norwegian</option>
                </select>
                <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
                  Preference saved on this device; translations can be connected later.
                </p>
              </div>

              <div className="border-b border-neutral-100 px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                  <Sun className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                  Appearance
                </div>
                <div className="mt-2 flex items-center justify-between rounded-md bg-neutral-50 px-2.5 py-2">
                  <span className="text-sm text-neutral-700">Light mode</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-neutral-500 shadow-card">
                    Current
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-400">
                  Dark mode is not available in the current dashboard theme.
                </p>
              </div>

              <div className="px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-medium text-neutral-700">
                  <UserRound className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                  Profile
                </div>
              </div>

              <div className="border-t border-neutral-100 p-1">
                <button
                  onClick={handleLogout}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  Log out
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}