export type NotificationType =
  | "RISK_CHANGE"
  | "CERTIFICATE_EXPIRY"
  | "VEHICLE_DEVIATION"
  | "FUEL_DEVIATION"
  | "DATA_SYNC"
  | "SYSTEM";

export type NotificationSeverity = "HIGH" | "MEDIUM" | "INFO";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  supplierId?: string;
  alertId?: string;
  // Keep the same display-ready time format used by RecentAlert
  timeAgo: string;
  read: boolean;
};