import { apiFetch } from "./client";
import * as db from "../mocks/db";
import type { Notification } from "../types/notification";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

// Mock-only: pass userId explicitly until the backend can resolve it from the auth token
export function getNotifications(userId: string): Promise<Notification[]> {
  if (USE_MOCKS) return Promise.resolve(db.getNotifications(userId));
  return apiFetch<Notification[]>("/admin/notifications");
}

export function markNotificationAsRead(userId: string, id: string): Promise<void> {
  if (USE_MOCKS) {
    db.markNotificationAsRead(userId, id);
    return Promise.resolve();
  }
  return apiFetch<void>(`/admin/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsAsRead(userId: string): Promise<void> {
  if (USE_MOCKS) {
    db.markAllNotificationsAsRead(userId);
    return Promise.resolve();
  }
  return apiFetch<void>("/admin/notifications/read-all", { method: "POST" });
}