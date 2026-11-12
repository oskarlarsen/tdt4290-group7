import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { acceptSupplierInvitation } from "../../api/auth";
import { ApiError } from "../../api/client";

const MIN_PASSWORD_LENGTH = 12;

export default function AcceptSupplierInvitation() {
  const [token] = useState(() => {
    const value = window.location.hash.slice(1).trim();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return value;
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("Invitasjonslenken mangler token. Be administratoren din om en ny invitasjon.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Passordet må være minst ${MIN_PASSWORD_LENGTH} tegn.`);
      return;
    }
    if (password !== confirmation) {
      setError("Passordene er ikke like.");
      return;
    }
    setWorking(true);
    try {
      await acceptSupplierInvitation({ token, newPassword: password, ...(name.trim() ? { name: name.trim() } : {}) });
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Invitasjonen kunne ikke godtas. Prøv igjen.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-neutral-100 bg-white p-6 shadow-card">
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">Aktiver leverandørkonto</h1>
        {complete ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm text-neutral-700">Leverandørkontoen din er klar. Logg inn med e-postadressen du ble invitert med og passordet du nettopp opprettet.</p>
            <Link to="/login" className="inline-flex rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800">Fortsett til innlogging</Link>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <p className="text-sm text-neutral-600">Velg et passord for å aktivere leverandørkontoen som er knyttet til denne invitasjonen.</p>
            <label className="block space-y-1.5 text-sm text-neutral-700">
              <span className="block text-xs font-medium">Navnet ditt <span className="font-normal text-neutral-500">(påkrevd hvis du ble invitert som kollega eller administrator)</span></span>
              <input maxLength={100} autoComplete="name" value={name} onChange={event => setName(event.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-900/10" />
            </label>
            <label className="block space-y-1.5 text-sm text-neutral-700">
              <span className="block text-xs font-medium">Passord (minst {MIN_PASSWORD_LENGTH} tegn)</span>
              <input required minLength={MIN_PASSWORD_LENGTH} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-900/10" />
            </label>
            <label className="block space-y-1.5 text-sm text-neutral-700">
              <span className="block text-xs font-medium">Bekreft passord</span>
              <input required minLength={MIN_PASSWORD_LENGTH} type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-900/10" />
            </label>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button type="submit" disabled={working} className="w-full rounded-lg bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60">{working ? "Aktiverer…" : "Aktiver konto"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
