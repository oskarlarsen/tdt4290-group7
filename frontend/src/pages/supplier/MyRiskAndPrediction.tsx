import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, ShieldAlert } from "lucide-react";
import { CERTIFICATE_STANDARD_LABELS, getCertificateStatus } from "../../types/certificate";
import { formatDate } from "../../utils/formatDate";

export default function MyRiskAndPrediction() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Kunne ikke laste data"}</div>;

  const { certificates } = data;

  const upcomingExpiries = certificates.flatMap((certificate) => {
      if (!certificate.validUntil) return [];
      const daysRemaining = getCertificateStatus(certificate).daysRemaining;
      return daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 90
        ? [{ certificate, validUntil: certificate.validUntil }]
        : [];
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">Min risiko og prediksjon</h1>

      <section className="rounded-xl border border-neutral-100 bg-white p-6">
         <h2 className="text-lg font-medium text-neutral-900 mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-neutral-500" />
            Gjeldende risikoindikatorer
         </h2>
         <div className="bg-neutral-50 p-4 rounded-lg border border-neutral-100">
             <p className="text-sm text-neutral-800">Kommunen rangerer leverandører etter risiko og deler ikke denne rangeringen. Se Påkrevde tiltak for hva du kan gjøre for å holde deg på rett spor.</p>
         </div>
      </section>

      <section className="rounded-xl border border-neutral-100 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900 mb-4">Sertifikater som utløper (neste 90 dager)</h2>
         {upcomingExpiries.length > 0 ? (
             <ul className="divide-y divide-neutral-100 border border-neutral-100 rounded-lg overflow-hidden">
                 {upcomingExpiries.map(({ certificate, validUntil }) => (
                     <li key={certificate.id} className="p-4 bg-white flex justify-between items-center">
                       <span className="text-sm font-medium text-neutral-900 uppercase tracking-wide">{CERTIFICATE_STANDARD_LABELS[certificate.standard]}</span>
                       <span className="text-sm text-amber-700 font-medium">Utløper: {formatDate(validUntil)}</span>
                    </li>
                ))}
             </ul>
         ) : (
             <div className="py-6 text-center text-sm text-neutral-500 border border-neutral-100 rounded-lg bg-neutral-50">
                Ingen sertifikater forventes å utløpe de neste 90 dagene.
             </div>
         )}
      </section>
    </div>
  );
}