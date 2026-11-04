import { useMySupplierOverview } from "../../hooks/useMySupplierOverview";
import { Loader2, FileText } from "lucide-react";
import { formatDate } from "../../utils/formatDate";

export default function MyCertificates() {
  const { data, isLoading, isError, error } = useMySupplierOverview();

  if (isLoading) return <div className="flex h-64 items-center justify-center text-neutral-400"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (isError || !data) return <div className="p-8 text-center text-sm text-red-700">{error instanceof Error ? error.message : "Error loading data"}</div>;

  const { raw } = data;
  const certificates = raw.certificates || [];

  const getStatus = (cert: any) => {
     if (!cert.certificateNumber && !cert.validUntil) return { label: "Missing", className: "bg-neutral-100 text-neutral-600" };
     if (!cert.validUntil) return { label: "Unknown", className: "bg-neutral-100 text-neutral-600" };

     const validUntilDate = new Date(cert.validUntil);
     const daysUntilExpiry = Math.ceil((validUntilDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));

     if (daysUntilExpiry < 0) return { label: "Expired", className: "bg-red-50 text-red-700" };
     if (daysUntilExpiry <= 30) return { label: "Expiring Soon", className: "bg-amber-50 text-amber-700" };
     return { label: "Valid", className: "bg-green-50 text-green-700" };
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="font-headline text-2xl font-semibold text-neutral-900">My Certificates</h1>

      {certificates.length === 0 ? (
         <div className="py-12 text-center text-sm text-neutral-500 border border-neutral-100 rounded-xl bg-white">
            No certificates required or registered.
         </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {certificates.map(cert => {
              const status = getStatus(cert);
              return (
                <div key={cert.id} className="rounded-xl border border-neutral-100 bg-white p-5 flex flex-col">
                   <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2 text-primary-700">
                         <FileText className="h-5 w-5" />
                         <h3 className="font-semibold text-sm uppercase tracking-wide">{cert.standard}</h3>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                         {status.label}
                      </span>
                   </div>

                   <div className="space-y-3 mt-auto">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase tracking-wide">Certificate Number</p>
                        <p className="text-sm font-medium text-neutral-900">{cert.certificateNumber || "Not submitted"}</p>
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