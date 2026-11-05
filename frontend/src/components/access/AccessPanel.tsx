import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveAccess, getAccess, inviteToAccess, renewAccess, revokeAccess, type AccessEntry, type AccessInvitation } from "../../api/access";
import { formatDate } from "../../utils/formatDate";

const DAY_MS = 86_400_000;
const MAX_DAYS = 90;
const RENEW_WINDOW_DAYS = 14;

const isoDay = (daysAhead: number) => new Date(Date.now() + daysAhead * DAY_MS).toISOString().slice(0, 10);

/** Whether Renew is offered: the grant has an end date that is 14 days away or less, or has passed. */
export function canRenew(entry: AccessEntry, now = Date.now()): boolean {
  return !!entry.accessExpiresAt && !entry.permanent && !entry.isYou && new Date(entry.accessExpiresAt).getTime() - now <= RENEW_WINDOW_DAYS * DAY_MS;
}

function describe(entry: AccessEntry): string {
  if (entry.permanent) return "No end date";
  if (!entry.accessExpiresAt) return entry.active ? "No end date" : "Access ended";
  // The stored instant is midnight after the last day, so the last day is the day before.
  const lastDay = new Date(new Date(entry.accessExpiresAt).getTime() - 1).toISOString();
  return entry.active ? `Until ${formatDate(lastDay)}` : `Ended ${formatDate(lastDay)}`;
}

/**
 * Who has access, and how to add, renew or end it. Suppliers see and manage their own organization; admins see
 * everyone and can also approve a grant, which keeps it working if the person who gave it later loses access.
 */
export function AccessPanel({ mode }: { mode: "supplier" | "admin" }) {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["access"], queryFn: getAccess, retry: false });
  const refresh = () => client.invalidateQueries({ queryKey: ["access"] });
  const [email, setEmail] = useState("");
  const [endDate, setEndDate] = useState("");
  const [invitation, setInvitation] = useState<AccessInvitation | null>(null);
  const invite = useMutation({
    mutationFn: () => inviteToAccess(mode, email.trim(), endDate || undefined),
    onSuccess: async (created) => { setInvitation(created); setEmail(""); setEndDate(""); await refresh(); },
  });
  const act = useMutation({ mutationFn: (run: () => Promise<void>) => run(), onSuccess: refresh });
  const [renewing, setRenewing] = useState<{ id: string; date: string } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvitation(null);
    invite.mutate();
  }

  const entries = list.data ?? [];
  const error = (invite.error ?? act.error) as Error | null;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-100 bg-white p-4">
        <h2 className="font-headline text-base font-semibold text-neutral-900">
          {mode === "admin" ? "Invite an administrator" : "Invite a colleague"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-700">
            Email address
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            Stand-in until <span className="font-normal text-neutral-400">(optional)</span>
            <input type="date" value={endDate} min={isoDay(0)} max={isoDay(MAX_DAYS)} onChange={(event) => setEndDate(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          A stand-in loses access at the end of that day, for up to {MAX_DAYS} days at a time. Leave it empty to add a permanent colleague.
          The person gives their own name when they activate the account. There is no email yet: pass the link on yourself.
        </p>
        <button type="submit" disabled={invite.isPending} className="rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {invite.isPending ? "Creating…" : "Create invitation"}
        </button>
        {invitation && (
          <p role="status" className="break-all rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
            Send this link to {invitation.email}. It works once, for 48 hours:
            <br /><span className="font-mono">{`${window.location.origin}/accept-invitation#${invitation.token}`}</span>
          </p>
        )}
      </form>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}
      {list.isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span className="font-medium text-neutral-900">{entry.name}{entry.isYou ? " (you)" : ""}</span>
              <span className="block text-xs text-neutral-500">
                {entry.email}{mode === "admin" ? ` · ${entry.role === "ADMIN" ? "Administrator" : "Supplier"}` : ""}
                {entry.grantedBy ? ` · given by ${entry.grantedBy}` : ""}
              </span>
              <span className={`block text-xs ${entry.active ? "text-neutral-500" : "text-red-700"}`}>
                {describe(entry)}
                {entry.approved ? " · approved by an admin" : ""}
              </span>
            </span>
            {!entry.isYou && !entry.permanent && (
              <span className="flex flex-wrap items-center gap-2">
                {canRenew(entry) && (renewing?.id === entry.id ? (
                  <span className="flex items-center gap-1">
                    <input type="date" aria-label="New end date" value={renewing.date} min={isoDay(0)} max={isoDay(MAX_DAYS)}
                      onChange={(event) => setRenewing({ id: entry.id, date: event.target.value })}
                      className="rounded-md border border-neutral-200 px-2 py-1 text-xs" />
                    <button type="button" disabled={!renewing.date || act.isPending}
                      onClick={() => { act.mutate(() => renewAccess(entry.id, renewing.date)); setRenewing(null); }}
                      className="rounded-lg bg-primary-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">Save</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setRenewing({ id: entry.id, date: "" })}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Renew</button>
                ))}
                {mode === "admin" && entry.grantedBy && !entry.approved && (
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate(() => approveAccess(entry.id))}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Approve</button>
                )}
                {entry.active && (
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate(() => revokeAccess(entry.id))}
                    aria-label={`Remove access for ${entry.name}`}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Remove access</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
