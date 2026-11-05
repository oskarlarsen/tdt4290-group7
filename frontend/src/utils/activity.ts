const DAY_MS = 86_400_000;

function whole(days: number): string {
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Whole calendar days between an instant and now (local time), never negative. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((start(now) - start(then)) / DAY_MS));
}

/** "Last active: 3 days ago", or when nothing was recorded, since when tracking has existed. */
export function describeLastActive(lastActiveAt: string | null | undefined, trackingSince?: string, now: Date = new Date()): string {
  if (lastActiveAt) return `Last active: ${whole(daysSince(lastActiveAt, now))}`;
  return trackingSince
    ? `No activity recorded since ${new Date(trackingSince).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "No activity recorded yet";
}

/** Says who made the change, so an admin's edit never reads as supplier activity. */
export function describeLastUpdated(updatedAt: string | null | undefined, by: string | null | undefined, now: Date = new Date()): string {
  if (!updatedAt) return "No updates recorded";
  const when = whole(daysSince(updatedAt, now));
  if (by === "SUPPLIER") return `Updated ${when} by the supplier`;
  if (by === "ADMIN") return `Updated ${when} by an admin, on the supplier's behalf`;
  return `Updated ${when}`;
}
