function parseCreationDate(createdAt?: string): Date | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAlertCreatedDate(createdAt?: string): string {
  const date = parseCreationDate(createdAt);
  if (!date) return "Ikke tilgjengelig";

  return date.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

export function formatAlertAge(createdAt?: string, now = new Date()): string {
  const date = parseCreationDate(createdAt);
  if (!date) return "Ikke tilgjengelig";

  const createdDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const ageInDays = Math.max(0, Math.floor((currentDay - createdDay) / 86_400_000));
  if (ageInDays === 0) return "I dag";
  if (ageInDays === 1) return "for 1 dag siden";
  if (ageInDays === 7) return "for 1 uke siden";
  return `for ${ageInDays} dager siden`;
}
