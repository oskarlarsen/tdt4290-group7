import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { Notification } from "../types/notification";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// The server resolves the user from the login; userId is only used by the mock layer.
// The mock notifications describe other suppliers, so a supplier always reads its own from the server.
export function getNotifications(userId: string, role?: string): Promise<Notification[]> {
  if (USE_MOCKS && role !== "SUPPLIER") return Promise.resolve(db.getNotifications(userId));
  return apiFetch<Notification[]>("/notifications");
}

export function markNotificationAsRead(userId: string, id: string): Promise<void> {
  if (USE_MOCKS) {
    db.markNotificationAsRead(userId, id);
    return Promise.resolve();
  }
  return apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (USE_MOCKS) {
    db.markAllNotificationsAsRead(userId);
    return Promise.resolve();
  }
  return apiFetch<void>("/notifications/read-all", { method: "POST" });
}