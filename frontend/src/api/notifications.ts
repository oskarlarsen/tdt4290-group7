import { apiFetch } from "./client";
import type { Notification } from "../types/notification";

// The server resolves the user from the login.
export function getNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>("/notifications");
}

export function markNotificationAsRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotificationsAsRead(): Promise<void> {
  return apiFetch<void>("/notifications/read-all", { method: "POST" });
}
