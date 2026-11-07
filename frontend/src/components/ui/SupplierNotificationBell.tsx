import { useState, useRef, useEffect } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import {
  useSupplierNotices,
  useMarkNoticeAsRead,
} from "../../hooks/useSupplierNotices";
import { useAuth } from "../../hooks/useAuth";
import { MOCK_SUPPLIER_MAPPING } from "../../utils/supplierOverview";

export function SupplierNotificationBell() {
  const { user } = useAuth();
  const authSupplierId = user?.supplierId;
  const supplierId = authSupplierId === "supplier-1" ? MOCK_SUPPLIER_MAPPING : authSupplierId;

  const { data: notices = [] } = useSupplierNotices(supplierId ?? null);
  const markAsRead = useMarkNoticeAsRead(supplierId ?? null);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notices.filter((n) => !n.isRead).length;

  function handleClick(noticeId: string, isRead: boolean) {
    if (!isRead) markAsRead.mutate(noticeId);
    // Since notifications for suppliers are handled in the Dashboard natively,
    // we just mark them as read when clicked in the bell. We don't route away.
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
        aria-label="View notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-red-600 ring-2 ring-white" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-neutral-100 bg-white py-1 shadow-card">
          <div className="flex items-center justify-between border-b border-neutral-50 px-4 py-2.5">
            <span className="text-sm font-semibold text-neutral-900">Messages</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notices.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-neutral-500">
                <CheckCircle2 className="h-4 w-4 text-tertiary-600" />
                No messages from municipality.
              </div>
            )}
            {notices.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n.id, n.isRead)}
                className={`block w-full border-b border-neutral-50 px-3 py-2.5 text-left last:border-b-0 hover:bg-neutral-50 ${
                  n.isRead ? "" : "bg-primary-50/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${n.isRead ? "font-normal text-neutral-700" : "font-semibold text-neutral-900"}`}>
                      {n.title}
                    </div>
                    <div className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{n.message}</div>
                    <div className="mt-1 font-mono text-[11px] text-neutral-400">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-neutral-100 px-3 py-2 text-center">
             <span className="cursor-not-allowed text-xs text-neutral-300">View all messages</span>
          </div>
        </div>
      )}
    </div>
  );
}
