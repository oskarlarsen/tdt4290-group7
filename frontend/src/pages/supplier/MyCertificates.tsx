import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import { CERTIFICATE_STANDARD_LABELS, getCertificateStatus } from "../../types/certificate";

export default function MyCertificates() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { certificates } = data;

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Certificates</h1>

      {certificates.length === 0 ? (
         <div className="py-12 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            No certificate records are linked to your agreements.
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {certificates.map(cert => {
               const status = getCertificateStatus(cert);
              return (
                <div key={cert.id} className="rounded-xl border border-neutral-100 bg-white p-5 flex flex-col">
                   <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2 text-primary-700">
                         <FileText className="h-5 w-5" />
                         <h3 className="font-semibold text-sm uppercase tracking-wide">{CERTIFICATE_STANDARD_LABELS[cert.standard]}</h3>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone === "red" ? "bg-red-50 text-red-700" : status.tone === "orange" ? "bg-orange-50 text-orange-700" : status.tone === "yellow" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                          {status.label}
                      </span>
                   </div>

                   <div className="space-y-3 mt-auto">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wide">Certificate Number</p>
                        <p className="text-sm font-medium text-neutral-900">{cert.certificateNumber || "Not extracted"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wide">Valid Until</p>
                        <p className="text-sm font-medium text-neutral-900">{cert.validUntil ? formatDate(cert.validUntil) : "Not submitted"}</p>
                      </div>
                   </div>
                </div>
              );
           })}
        </div>
      )}
    </div>
  );
}