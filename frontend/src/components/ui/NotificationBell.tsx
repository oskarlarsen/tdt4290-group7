import { useState, useRef, useEffect } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from "../../hooks/useNotifications";
import { useAuth } from "../../hooks/useAuth";
import type { Notification } from "../../types/notification";

const SEVERITY_DOT: Record<Notification["severity"], string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-400",
  INFO: "bg-neutral-400",
};

export function NotificationBell() {
  const { data: notifications = [] } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleClick(n: Notification) {
    if (!n.read) markAsRead.mutate(n.id);
    setOpen(false);
    // A supplier's notification is about one of its alerts; an admin's goes to the supplier it concerns.
    if (user?.role === "SUPPLIER") navigate("/supplier/alerts");
    else if (n.supplierId) navigate(`/admin/suppliers/${n.supplierId}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-7 w-8 shrink-0 items-center justify-center rounded-full p-0 text-neutral-500 hover:bg-neutral-50"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-4 shrink-0" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-semibold leading-none text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-neutral-100 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <span className="text-xs font-mono uppercase tracking-wide text-neutral-500">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead.mutate()}
                className="text-xs font-medium text-secondary-700 hover:text-secondary-800"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-neutral-500">
                <CheckCircle2 className="h-4 w-4 text-tertiary-600" />
                You're all caught up. No new notifications.
              </div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`block w-full border-b border-neutral-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-neutral-50 ${
                  n.read ? "" : "bg-primary-50/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[n.severity]}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${n.read ? "font-normal text-neutral-700" : "font-semibold text-neutral-900"}`}>
                      {n.title}
                    </div>
                    <div className="text-xs text-neutral-500">{n.message}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-neutral-500">{n.timeAgo}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* No notification-history page exists yet — shown disabled
              rather than wired to a fake route */}
          <div className="border-t border-neutral-100 px-3 py-2 text-center">
            <span className="cursor-not-allowed text-xs text-neutral-500">View all notifications</span>
          </div>
        </div>
      )}
    </div>
  );
}