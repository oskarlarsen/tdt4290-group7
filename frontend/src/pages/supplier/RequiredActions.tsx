import { Link } from "react-router-dom";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { buildRequiredActions } from "../../utils/requiredActions";

const PRIORITY_LABELS = { high: "Høy prioritet", medium: "Middels prioritet", low: "Lav prioritet" } as const;
const PRIORITY_CLASSES = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-sky-100 text-sky-800",
} as const;

export default function RequiredActions() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div role="alert" className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Kunne ikke laste påkrevde tiltak."}</div>;

  const actions = buildRequiredActions(data);

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Påkrevde tiltak</h1>
      <p className="text-sm text-neutral-500">Det kommunen venter på fra deg, utledet fra opplysningene du har sendt inn.</p>

      {actions.length === 0 ? (
        <section className="flex flex-col items-center rounded-xl border border-neutral-100 bg-white py-12 text-center text-sm text-neutral-500">
          <CheckCircle2 className="mb-3 h-8 w-8 text-tertiary-700" aria-hidden="true" />
          <p>Ingenting venter på deg akkurat nå.</p>
        </section>
      ) : (
        <ul className="space-y-3">
          {actions.map((action) => (
            <li key={action.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-100 bg-white p-4">
              <div className="flex min-w-0 items-start gap-3">
                <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{action.title}</p>
                  <p className="mt-0.5 text-sm text-neutral-500">{action.detail}</p>
                  <span className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLASSES[action.priority]}`}>{PRIORITY_LABELS[action.priority]}</span>
                </div>
              </div>
              <Link to={action.to} className="inline-flex h-8 items-center whitespace-nowrap rounded-lg bg-primary-900 px-3 text-xs font-medium text-white hover:bg-primary-700">
                {action.linkLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
