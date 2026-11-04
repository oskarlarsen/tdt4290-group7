function parseCreationDate(createdAt?: string): Date | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAlertCreatedDate(createdAt?: string): string {
  const date = parseCreationDate(createdAt);
  if (!date) return "Unavailable";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatAlertAge(createdAt?: string, now = new Date()): string {
  const date = parseCreationDate(createdAt);
  if (!date) return "Unavailable";

  const createdDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const ageInDays = Math.max(0, Math.floor((currentDay - createdDay) / 86_400_000));
  if (ageInDays === 0) return "Today";
  if (ageInDays === 1) return "1 day ago";
  if (ageInDays === 7) return "1 week ago";
  return `${ageInDays} days ago`;
}
