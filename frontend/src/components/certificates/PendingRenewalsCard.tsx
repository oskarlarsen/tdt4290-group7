import { useConfirmCertificateArchive, useRejectCertificateArchive } from "../../hooks/useCertificates";
import type { Certificate } from "../../types/certificate";
import { CERTIFICATE_STANDARD_LABELS, formatCertificateDate } from "../../types/certificate";

/**
 * A supplier's renewal only proposes archiving the older certificate: both stay live until an admin decides,
 * because the new expiry date is read from a file the supplier chose.
 */
export function PendingRenewalsCard({ certificates }: { certificates: Certificate[] }) {
  const confirm = useConfirmCertificateArchive();
  const reject = useRejectCertificateArchive();
  const byId = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  const pending = certificates.filter((certificate) => certificate.archivePendingFor && !certificate.archivedAt);
  if (pending.length === 0) return null;
  const error = confirm.error ?? reject.error;
  const busy = confirm.isPending || reject.isPending;

  return (
    <section aria-labelledby="pending-renewals" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 id="pending-renewals" className="font-headline text-base font-semibold text-neutral-900">
        Fornyelser til vurdering ({pending.length})
      </h2>
      <p className="mt-1 text-xs text-neutral-600">
        Bekreftelse arkiverer det eldre sertifikatet. Frem til da er begge aktive, og det eldre gir fortsatt varsler.
      </p>
      <ul className="mt-3 space-y-2">
        {pending.map((renewal) => {
          const old = byId.get(renewal.archivePendingFor!);
          return (
            <li key={renewal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm">
              <span>
                <span className="font-medium text-neutral-900">{renewal.supplierName}</span>
                {" · "}
                {CERTIFICATE_STANDARD_LABELS[renewal.standard]}
                <span className="block text-xs text-neutral-500">
                  Det nye utløper {renewal.validUntil ? formatCertificateDate(renewal.validUntil) : "på ukjent dato"}
                  {old?.validUntil ? `, erstatter det som utløper ${formatCertificateDate(old.validUntil)}` : ""}
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { confirm.reset(); reject.reset(); reject.mutate(renewal.id); }}
                  aria-label={`Avvis fornyelse for ${renewal.supplierName}`}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Behold begge
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { confirm.reset(); reject.reset(); confirm.mutate(renewal.id); }}
                  aria-label={`Bekreft fornyelse for ${renewal.supplierName}`}
                  className="rounded-lg bg-primary-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Arkiver det eldre
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error instanceof Error ? error.message : "Kunne ikke oppdatere fornyelsen."}
        </p>
      )}
    </section>
  );
}
