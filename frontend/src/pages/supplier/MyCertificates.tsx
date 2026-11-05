import { useState } from "react";
import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { SupplierCertificateUploadDialog } from "../../components/certificates/SupplierCertificateUploadDialog";
import { Loader2, FileText } from "lucide-react";
import { formatDate } from "../../utils/formatDate";
import { CERTIFICATE_STANDARD_LABELS, getCertificateStatus } from "../../types/certificate";

export default function MyCertificates() {
  const { data, isLoading, isError, error } = useMySupplierOverview();
  // undefined = closed; "" = open with no agreement chosen; an id = a renewal for that agreement.
  const [uploadFor, setUploadFor] = useState<string | undefined>(undefined);

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  // Archived certificates stay as history: they are replaced or withdrawn, and raise no alerts.
  const certificates = data.certificates.filter((cert) => !cert.archivedAt);
  const archived = data.certificates.filter((cert) => cert.archivedAt);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Certificates</h1>
        <button
          type="button"
          onClick={() => setUploadFor("")}
          disabled={data.agreements.length === 0}
          className="rounded-lg bg-primary-900 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          Upload certificate
        </button>
      </div>

      {certificates.length === 0 && archived.length === 0 ? (
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

                   {cert.archivePendingFor && (
                      <p className="mb-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">Waiting for admin review</p>
                   )}
                   <div className="space-y-3 mt-auto">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wide">Certificate Number</p>
                        <p className="text-sm font-medium text-neutral-900">{cert.certificateNumber || "Not extracted"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wide">Valid Until</p>
                        <p className="text-sm font-medium text-neutral-900">{cert.validUntil ? formatDate(cert.validUntil) : "Not submitted"}</p>
                      </div>
                      {status.group !== "valid" && !cert.archivePendingFor && (
                        <button
                          type="button"
                          onClick={() => setUploadFor(cert.contractId)}
                          className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Renew
                        </button>
                      )}
                   </div>
                </div>
              );
           })}
        </div>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-certificates" className="pt-4">
          <h2 id="archived-certificates" className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Archived</h2>
          <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-100 bg-white">
            {archived.map((cert) => (
              <li key={cert.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-neutral-600">
                <span className="font-medium text-neutral-800">{CERTIFICATE_STANDARD_LABELS[cert.standard]}</span>
                <span>{cert.validUntil ? `Valid until ${formatDate(cert.validUntil)}` : "No date submitted"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {uploadFor !== undefined && (
        <SupplierCertificateUploadDialog
          agreements={data.agreements}
          initialAgreementId={uploadFor || undefined}
          onClose={() => setUploadFor(undefined)}
        />
      )}
    </div>
  );
}
