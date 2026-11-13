const DAY_MS = 86_400_000;

function whole(days: number): string {
  return days <= 0 ? "i dag" : days === 1 ? "for 1 dag siden" : `for ${days} dager siden`;
}

/** Whole calendar days between an instant and now (local time), never negative. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((start(now) - start(then)) / DAY_MS));
}

/** "Sist aktiv: for 3 dager siden", or when nothing was recorded, since when tracking has existed. */
export function describeLastActive(lastActiveAt: string | null | undefined, trackingSince?: string, now: Date = new Date()): string {
  if (lastActiveAt) return `Sist aktiv: ${whole(daysSince(lastActiveAt, now))}`;
  return trackingSince
    ? `Ingen aktivitet registrert siden ${new Date(trackingSince).toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" })}`
    : "Ingen aktivitet registrert ennå";
}

/** Says who made the change, so an admin's edit never reads as supplier activity. */
export function describeLastUpdated(updatedAt: string | null | undefined, by: string | null | undefined, now: Date = new Date()): string {
  if (!updatedAt) return "Ingen oppdateringer registrert";
  const when = whole(daysSince(updatedAt, now));
  if (by === "SUPPLIER") return `Oppdatert ${when} av leverandøren`;
  if (by === "ADMIN") return `Oppdatert ${when} av en administrator på vegne av leverandøren`;
  return `Oppdatert ${when}`;
}
