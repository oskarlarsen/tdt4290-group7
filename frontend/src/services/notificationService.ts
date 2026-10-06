// TODO: Replace the mock with the backend email service when available

export type NotificationEvent = {
  type: "high-risk-supplier" | "certificate-expiring" | "vehicle-deviation" | "fuel-deviation";
  subject: string;
  message: string;
};

export async function sendEmailNotification(
  event: NotificationEvent,
  recipientEmail: string
): Promise<{ sent: boolean }> {
  // MOCK — no real email is sent.
  console.info(`[mock email] would send "${event.subject}" to ${recipientEmail}:\n${event.message}`);
  return { sent: true };
}