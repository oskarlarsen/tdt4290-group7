import { Bell, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSupplierAlerts } from "../../hooks/useSupplierAlerts";
import { getSupplierNotes } from "../../api/supplierAlerts";
import { ALERT_CATEGORIES } from "../../types/dashboard";
import type { AlertCategory } from "../../types/dashboard";
import { ALERT_SEVERITY_LABELS } from "../../components/alerts/AlertBadges";
import { formatDate } from "../../utils/formatDate";

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  ENVIRONMENTAL_COMPLIANCE: "Miljøoppfølging",
  ENERGY_FUEL: "Energi",
  VEHICLE_COMPLIANCE: "Kjøretøyoppfølging",
  CERTIFICATES: "Sertifikater",
};

const SEVERITY_CLASSES = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-800",
  low: "bg-neutral-100 text-neutral-700",
};

export default function MyAlerts() {
  // The category lives in the URL so a link such as ?category=VEHICLE_COMPLIANCE opens the filtered feed.
  const [params, setParams] = useSearchParams();
  const categoryParam = params.get("category");
  const category = ALERT_CATEGORIES.find((candidate) => candidate === categoryParam);
  const { data: alerts, isLoading, isError, error } = useSupplierAlerts(category);
  const { data: notes } = useQuery({ queryKey: ["supplier-notes"], queryFn: getSupplierNotes, retry: false });

  function setCategory(next: string) {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set("category", next);
    else nextParams.delete("category");
    setParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">Mine varsler</h1>
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="font-medium text-neutral-700">Kategori:</span>
          <select
            value={category ?? ""}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filtrer varsler etter kategori"
            className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700"
          >
            <option value="">Alle</option>
            {ALERT_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
          </select>
        </label>
      </div>

      {notes && notes.length > 0 && (
        <section className="rounded-xl border border-primary-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Messages from your contact</h2>
          <ul className="mt-2 space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg bg-neutral-50 p-2.5">
                <p className="whitespace-pre-wrap text-sm text-neutral-700">{note.text}</p>
                <p className="mt-1 text-xs text-neutral-500">{formatDate(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isLoading && <div className="flex h-40 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {isError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Kunne ikke laste varslene dine."}
        </div>
      )}
      {alerts && alerts.length === 0 && (
        <section className="flex flex-col items-center rounded-xl border border-neutral-100 bg-white py-12 text-center text-sm text-neutral-500">
          <Bell className="mb-3 h-8 w-8 text-neutral-300" />
          <p>{category ? "Ingen varsler i denne kategorien." : "Du har ingen varsler."}</p>
        </section>
      )}
      {alerts && alerts.length > 0 && (
        <ul className="space-y-3">
          {alerts.map((alert) => (
            <li key={alert.id} className={`rounded-xl border border-neutral-100 bg-white p-4 ${alert.status === "RESOLVED" ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-neutral-900">{alert.title}</h2>
                <span className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${SEVERITY_CLASSES[alert.severity]}`}>{ALERT_SEVERITY_LABELS[alert.severity]}</span>
                  <span className="text-neutral-500">{alert.status === "RESOLVED" ? "Løst" : "Åpen"}</span>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{alert.description}</p>
              <p className="mt-2 text-xs text-neutral-500">
                {CATEGORY_LABELS[alert.category]} · Opprettet {formatDate(alert.createdAt)}
                {alert.dueDate ? ` · Frist ${formatDate(alert.dueDate)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
