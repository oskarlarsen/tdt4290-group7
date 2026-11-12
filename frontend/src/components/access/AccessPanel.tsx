import { useState, type FormEvent } from "react";
import { CopyableValue } from "../ui/CopyableValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveAccess, getAccess, getPendingInvitations, inviteToAccess, renewAccess, revokeAccess, type AccessEntry, type AccessInvitation, type PendingInvitation } from "../../api/access";
import { inviteSupplier } from "../../api/vehicles";
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
  if (entry.permanent) return "Ingen sluttdato";
  if (!entry.accessExpiresAt) return entry.active ? "Ingen sluttdato" : "Tilgang avsluttet";
  // The stored instant is midnight after the last day, so the last day is the day before.
  const lastDay = new Date(new Date(entry.accessExpiresAt).getTime() - 1).toISOString();
  return entry.active ? `Til ${formatDate(lastDay)}` : `Avsluttet ${formatDate(lastDay)}`;
}

/**
 * Who has access, and how to add, renew or end it. Suppliers see and manage their own organization; admins see
 * everyone and can also approve a grant, which keeps it working if the person who gave it later loses access.
 */
export function AccessPanel({ mode }: { mode: "supplier" | "admin" }) {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["access"], queryFn: getAccess, retry: false });
  const pending = useQuery({ queryKey: ["access", "invitations"], queryFn: getPendingInvitations, retry: false });
  const refresh = () => client.invalidateQueries({ queryKey: ["access"] });
  const [email, setEmail] = useState("");
  const [endDate, setEndDate] = useState("");
  const [invitation, setInvitation] = useState<AccessInvitation | null>(null);
  const invite = useMutation({
    mutationFn: () => inviteToAccess(mode, email.trim(), endDate || undefined),
    onSuccess: async (created) => { setInvitation(created); setEmail(""); setEndDate(""); await refresh(); },
  });
  // The server keeps only a hash of each link, so a lost link is replaced by a new one for the same person.
  const [newLink, setNewLink] = useState<AccessInvitation | null>(null);
  const regenerate = useMutation({
    mutationFn: async (pending: PendingInvitation): Promise<AccessInvitation> => {
      if (pending.contact) return { ...(await inviteSupplier(pending.supplierId!, pending.email)), accessExpiresAt: null };
      const lastDay = pending.accessExpiresAt ? new Date(new Date(pending.accessExpiresAt).getTime() - 1).toISOString().slice(0, 10) : undefined;
      // An admin reissuing a supplier colleague's link names the organization; a supplier's own organization is implied.
      if (mode === "admin" && pending.role === "SUPPLIER") return inviteToAccess("admin", pending.email, lastDay, pending.supplierId!);
      return inviteToAccess(pending.role === "ADMIN" ? "admin" : "supplier", pending.email, lastDay);
    },
    // The earlier link for the same person no longer works, so stop showing it.
    onSuccess: async (created) => { setNewLink(created); setInvitation(current => current?.email === created.email ? null : current); await refresh(); },
  });
  const canRegenerate = (pending: PendingInvitation) =>
    pending.contact || (mode === "admin" && pending.role === "SUPPLIER") ? mode === "admin" && !!pending.supplierId : mode === (pending.role === "ADMIN" ? "admin" : "supplier");
  const act = useMutation({ mutationFn: (run: () => Promise<void>) => run(), onSuccess: refresh });
  const [renewing, setRenewing] = useState<{ id: string; date: string } | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvitation(null);
    invite.mutate();
  }

  const entries = list.data ?? [];
  const error = (invite.error ?? act.error ?? regenerate.error) as Error | null;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-neutral-100 bg-white p-4">
        <h2 className="font-headline text-base font-semibold text-neutral-900">
          {mode === "admin" ? "Inviter en administrator" : "Inviter en kollega"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-700">
            E-postadresse
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            Midlertidig tilgang til <span className="font-normal text-neutral-500">(valgfritt)</span>
            <input type="date" value={endDate} min={isoDay(0)} max={isoDay(MAX_DAYS)} onChange={(event) => setEndDate(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          Midlertidig tilgang utløper ved slutten av den dagen, i opptil {MAX_DAYS} dager om gangen. La feltet stå tomt for å legge til en fast kollega.
          Personen oppgir selv navnet sitt når kontoen aktiveres. Det sendes ingen e-post ennå: send lenken videre selv.
        </p>
        <button type="submit" disabled={invite.isPending} className="rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {invite.isPending ? "Oppretter…" : "Opprett invitasjon"}
        </button>
        {invitation && (
          <div role="status" className="space-y-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
            <p>Send denne lenken til {invitation.email}. Den fungerer én gang, i 48 timer.</p>
            <CopyableValue label="Invitasjonslenke" value={`${window.location.origin}/accept-invitation#${invitation.token}`} />
          </div>
        )}
      </form>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}
      {list.isLoading && <p className="text-sm text-neutral-500">Laster…</p>}

      <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span className="font-medium text-neutral-900">{entry.name}{entry.isYou ? " (deg)" : ""}</span>
              <span className="block text-xs text-neutral-500">
                {entry.email}{mode === "admin" ? ` · ${entry.role === "ADMIN" ? "Administrator" : "Leverandør"}` : ""}
                {entry.grantedBy ? ` · gitt av ${entry.grantedBy}` : ""}
              </span>
              <span className={`block text-xs ${entry.active ? "text-neutral-500" : "text-red-700"}`}>
                {describe(entry)}
                {entry.approved ? " · godkjent av en administrator" : ""}
              </span>
            </span>
            {!entry.isYou && !entry.permanent && (
              <span className="flex flex-wrap items-center gap-2">
                {canRenew(entry) && (renewing?.id === entry.id ? (
                  <span className="flex items-center gap-1">
                    <input type="date" aria-label="Ny sluttdato" value={renewing.date} min={isoDay(0)} max={isoDay(MAX_DAYS)}
                      onChange={(event) => setRenewing({ id: entry.id, date: event.target.value })}
                      className="rounded-md border border-neutral-200 px-2 py-1 text-xs" />
                    <button type="button" disabled={!renewing.date || act.isPending}
                      onClick={() => { act.mutate(() => renewAccess(entry.id, renewing.date)); setRenewing(null); }}
                      className="rounded-lg bg-primary-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">Lagre</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setRenewing({ id: entry.id, date: "" })}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Forny</button>
                ))}
                {mode === "admin" && entry.grantedBy && !entry.approved && (
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate(() => approveAccess(entry.id))}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Godkjenn</button>
                )}
                {entry.active && (
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate(() => revokeAccess(entry.id))}
                    aria-label={`Fjern tilgang for ${entry.name}`}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Fjern tilgang</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!!pending.data?.length && (
        <section aria-labelledby="pending-invitations" className="space-y-2">
          <h2 id="pending-invitations" className="font-headline text-base font-semibold text-neutral-900">Ventende invitasjoner</h2>
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
            {pending.data.map((invite) => (
              <li key={`${invite.role}-${invite.email}`} className="px-4 py-3 text-sm">
                <span className="font-medium text-neutral-900">{invite.email}</span>
                <span className="block text-xs text-neutral-500">
                  {mode === "admin" ? `${invite.role === "ADMIN" ? "Administrator" : "Leverandør"}${invite.supplierName ? ` · ${invite.supplierName}` : ""} · ` : ""}
                  Ikke aktivert ennå · lenken utløper {formatDate(invite.expiresAt)}{invite.accessExpiresAt ? ` · tilgang til ${formatDate(new Date(new Date(invite.accessExpiresAt).getTime() - 1).toISOString())}` : ""}
                </span>
                {newLink?.email === invite.email ? (
                  <div className="mt-2"><CopyableValue label="Ny invitasjonslenke" value={`${window.location.origin}/accept-invitation#${newLink.token}`} /></div>
                ) : canRegenerate(invite) && (
                  <button type="button" disabled={regenerate.isPending} onClick={() => regenerate.mutate(invite)}
                    className="mt-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                    Opprett ny lenke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
