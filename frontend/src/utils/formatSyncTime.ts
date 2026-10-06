// Format the stored sync time as today, yesterday, or a full date
export function formatSyncTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const time = then.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const isSameDay =
    then.getDate() === now.getDate() &&
    then.getMonth() === now.getMonth() &&
    then.getFullYear() === now.getFullYear();
  if (isSameDay) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    then.getDate() === yesterday.getDate() &&
    then.getMonth() === yesterday.getMonth() &&
    then.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return `Yesterday at ${time}`;

  return `${then.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
}