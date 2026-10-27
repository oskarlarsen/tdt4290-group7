import type { Certificate, CertificateStatus } from "../../types/certificate";
import { Fragment, useState } from "react";

const STATUS_LABELS: Record<CertificateStatus, string> = {
  VALID: "Valid",
  EXPIRES_180D: "Expires within 6 months",
  EXPIRES_90D: "Expires within 3 months",
  EXPIRES_30D: "Expires within 30 days",
  EXPIRED: "Expired",
  MISSING_DOCUMENTATION: "Expiry date missing",
};

const STATUS_STYLES: Record<CertificateStatus, string> = {
  VALID: "bg-green-50 text-green-700",
  EXPIRES_180D: "bg-yellow-50 text-yellow-800",
  EXPIRES_90D: "bg-orange-50 text-orange-800",
  EXPIRES_30D: "bg-red-50 text-red-700",
  EXPIRED: "bg-red-100 text-red-800",
  MISSING_DOCUMENTATION: "bg-red-100 text-red-800",
};

export function CertificateTable({
  certificates,
  onEdit,
  onDelete,
}: {
  certificates: Certificate[];
  onEdit: (certificate: Certificate) => void;
  onDelete: (certificate: Certificate) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (certificates.length === 0) {
    return <p className="py-10 text-center text-sm text-neutral-500">No certificates have been uploaded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-neutral-100 text-xs text-neutral-500">
          <tr>
            <th className="px-3 py-2 font-medium">Supplier</th>
            <th className="px-3 py-2 font-medium">Certificate</th>
            <th className="px-3 py-2 font-medium">Issue date</th>
            <th className="px-3 py-2 font-medium">Expiry date</th>
            <th className="px-3 py-2 font-medium">Contract reference</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {certificates.map((certificate) => (
            <Fragment key={certificate.id}>
              <tr>
                <td className="px-3 py-3 font-medium text-neutral-800">{certificate.supplierName}</td>
                <td className="px-3 py-3 text-neutral-700">{certificate.certificateType}</td>
                <td className="px-3 py-3 text-neutral-600">
                  {certificate.issueDate ? new Date(`${certificate.issueDate}T00:00:00`).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-3 text-neutral-600">
                  {certificate.expiryDate ? new Date(`${certificate.expiryDate}T00:00:00`).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-3 text-neutral-600">{certificate.contractId ?? "—"}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[certificate.status]}`}>
                    {STATUS_LABELS[certificate.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={expandedId === certificate.id}
                      onClick={() => setExpandedId(expandedId === certificate.id ? null : certificate.id)}
                      className="rounded px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30"
                    >
                      {expandedId === certificate.id ? "Hide details" : "Details"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(certificate)}
                      className="rounded px-2 py-1 text-xs font-medium text-primary-900 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(certificate)}
                      className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700/30"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {expandedId === certificate.id && (
                <tr className="bg-neutral-50">
                  <td colSpan={7} className="px-3 py-3 text-xs text-neutral-600">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div><dt className="font-semibold text-neutral-800">Uploaded document</dt><dd className="break-all">{certificate.sourceFile}</dd></div>
                      <div><dt className="font-semibold text-neutral-800">Certificate ID</dt><dd className="break-all">{certificate.id}</dd></div>
                    </dl>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
